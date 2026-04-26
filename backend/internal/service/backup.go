package service

import (
	"compress/gzip"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/rs/zerolog"
	"golang.org/x/crypto/pbkdf2"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrInvalidBackupSettings = errors.New("invalid backup settings")
	ErrNoPassphrase          = errors.New("backup passphrase is not configured")
	ErrInvalidBackupFile     = errors.New("invalid or corrupt backup file")
	ErrWrongPassphrase       = errors.New("wrong passphrase")
)

// On-disk format produced by the backup service:
//   magic(8) || saltLen(1) || salt(saltLen) || iv(16) || ciphertext || hmac(32)
// magic = "SUB12BK1"; key = PBKDF2-SHA256(pass, salt, 200_000, 64) split into
// AES key (first 32) + HMAC key (last 32). The ciphertext stream is gzip then
// AES-256-CTR. HMAC covers magic+salt+iv+ciphertext (encrypt-then-MAC).

const (
	backupMagic     = "SUB12BK1"
	backupSaltLen   = 16
	backupKeyIter   = 200_000
	backupKeyLen    = 64
	backupHMACBytes = 32
)

// BackupConfig is the runtime config the service needs that cannot be derived
// from backup_settings — namely the database connection details used to invoke
// pg_dump / pg_restore.
type BackupConfig struct {
	DBHost     string
	DBPort     string
	DBName     string
	DBUser     string
	DBPassword string
	DBSSLMode  string
}

type BackupService struct {
	repo *repository.BackupRepository
	cfg  BackupConfig
	log  zerolog.Logger
}

func NewBackupService(repo *repository.BackupRepository, cfg BackupConfig, log zerolog.Logger) *BackupService {
	return &BackupService{repo: repo, cfg: cfg, log: log}
}

// GetSettings returns the singleton row in API-safe form.
func (s *BackupService) GetSettings(ctx context.Context) (*model.BackupSettingsResponse, error) {
	settings, err := s.repo.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	return settings.ToResponse(), nil
}

func (s *BackupService) UpsertSettings(ctx context.Context, in *model.UpsertBackupSettingsInput, updatedBy string) (*model.BackupSettingsResponse, error) {
	if err := validateBackupSettings(in); err != nil {
		return nil, err
	}
	settings, err := s.repo.UpsertSettings(ctx, in, ptrIfSet(in.S3AccessKey), ptrIfSet(in.S3SecretKey), ptrIfSet(in.Passphrase), updatedBy)
	if err != nil {
		return nil, err
	}
	return settings.ToResponse(), nil
}

func ptrIfSet(p *string) *string {
	if p == nil {
		return nil
	}
	if strings.TrimSpace(*p) == "" {
		return nil
	}
	return p
}

func validateBackupSettings(in *model.UpsertBackupSettingsInput) error {
	switch in.Frequency {
	case "disabled", "hourly", "daily", "weekly":
	default:
		return fmt.Errorf("%w: frequency must be disabled|hourly|daily|weekly", ErrInvalidBackupSettings)
	}
	if in.HourOfDay < 0 || in.HourOfDay > 23 {
		return fmt.Errorf("%w: hour_of_day must be 0-23", ErrInvalidBackupSettings)
	}
	if in.DayOfWeek < 0 || in.DayOfWeek > 6 {
		return fmt.Errorf("%w: day_of_week must be 0-6", ErrInvalidBackupSettings)
	}
	switch in.Destination {
	case "local", "s3", "both":
	default:
		return fmt.Errorf("%w: destination must be local|s3|both", ErrInvalidBackupSettings)
	}
	if in.Destination == "local" || in.Destination == "both" {
		if strings.TrimSpace(in.LocalPath) == "" {
			return fmt.Errorf("%w: local_path is required for local destination", ErrInvalidBackupSettings)
		}
	}
	if in.Destination == "s3" || in.Destination == "both" {
		if in.S3Endpoint == nil || strings.TrimSpace(*in.S3Endpoint) == "" {
			return fmt.Errorf("%w: s3_endpoint is required for s3 destination", ErrInvalidBackupSettings)
		}
		if in.S3Bucket == nil || strings.TrimSpace(*in.S3Bucket) == "" {
			return fmt.Errorf("%w: s3_bucket is required for s3 destination", ErrInvalidBackupSettings)
		}
	}
	if in.RetainCount < 0 {
		return fmt.Errorf("%w: retain_count must be >= 0", ErrInvalidBackupSettings)
	}
	if in.RetainDays < 0 {
		return fmt.Errorf("%w: retain_days must be >= 0", ErrInvalidBackupSettings)
	}
	return nil
}

// RunResult is what RunBackup returns to callers (handler / scheduler).
type RunResult struct {
	Run *model.BackupRun
}

// RunBackup performs a single end-to-end backup: pg_dump → gzip → encrypt →
// write to local disk and/or S3 → record in backup_runs → prune old artifacts.
// Caller passes the trigger ("manual" | "scheduled") and (for manual) the
// initiating admin's user id.
func (s *BackupService) RunBackup(ctx context.Context, trigger string, createdBy *string) (*RunResult, error) {
	settings, err := s.repo.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	if settings.PassphraseEncrypted == nil || *settings.PassphraseEncrypted == "" {
		return nil, ErrNoPassphrase
	}
	passphrase := *settings.PassphraseEncrypted

	filename := fmt.Sprintf("sub12-backup-%s.pgdump.gz.enc", time.Now().UTC().Format("20060102-150405"))

	run, err := s.repo.CreateRun(ctx, trigger, settings.Destination, filename, createdBy)
	if err != nil {
		return nil, err
	}

	finish := func(status string, sizeBytes int64, localPath, s3Key, errMsg *string) {
		_ = s.repo.FinishRun(ctx, run.ID, status, sizeBytes, localPath, s3Key, errMsg)
		_ = s.repo.UpdateLastRun(ctx, status, errMsg)
	}

	tmpDir, err := os.MkdirTemp("", "sub12-backup-*")
	if err != nil {
		msg := err.Error()
		finish("failed", 0, nil, nil, &msg)
		return nil, err
	}
	defer os.RemoveAll(tmpDir)

	tmpFile := filepath.Join(tmpDir, filename)
	size, err := s.dumpAndEncrypt(ctx, tmpFile, passphrase)
	if err != nil {
		s.log.Error().Err(err).Msg("backup: dump+encrypt failed")
		msg := err.Error()
		finish("failed", 0, nil, nil, &msg)
		return nil, err
	}

	var (
		localPath *string
		s3Key     *string
	)

	if settings.Destination == "local" || settings.Destination == "both" {
		dest := filepath.Join(settings.LocalPath, filename)
		if err := os.MkdirAll(settings.LocalPath, 0o750); err != nil {
			msg := err.Error()
			finish("failed", size, nil, nil, &msg)
			return nil, err
		}
		if err := copyFile(tmpFile, dest); err != nil {
			msg := err.Error()
			finish("failed", size, nil, nil, &msg)
			return nil, err
		}
		localPath = &dest
	}

	if settings.Destination == "s3" || settings.Destination == "both" {
		key, err := s.uploadToS3(ctx, settings, tmpFile, filename)
		if err != nil {
			s.log.Error().Err(err).Msg("backup: s3 upload failed")
			msg := err.Error()
			finish("failed", size, localPath, nil, &msg)
			return nil, err
		}
		s3Key = &key
	}

	finish("success", size, localPath, s3Key, nil)

	if err := s.prune(ctx, settings); err != nil {
		s.log.Warn().Err(err).Msg("backup: prune step had errors")
	}

	final, _ := s.repo.GetRun(ctx, run.ID)
	if final == nil {
		final = run
	}
	return &RunResult{Run: final}, nil
}

func (s *BackupService) dumpAndEncrypt(ctx context.Context, outPath, passphrase string) (int64, error) {
	out, err := os.Create(outPath)
	if err != nil {
		return 0, err
	}
	defer out.Close()

	salt := make([]byte, backupSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return 0, err
	}
	iv := make([]byte, aes.BlockSize)
	if _, err := rand.Read(iv); err != nil {
		return 0, err
	}
	keys := pbkdf2.Key([]byte(passphrase), salt, backupKeyIter, backupKeyLen, sha256.New)
	encKey, macKey := keys[:32], keys[32:]

	block, err := aes.NewCipher(encKey)
	if err != nil {
		return 0, err
	}
	mac := hmac.New(sha256.New, macKey)

	// Write header: magic || saltLen || salt || iv (also feed into HMAC).
	header := make([]byte, 0, len(backupMagic)+1+backupSaltLen+aes.BlockSize)
	header = append(header, []byte(backupMagic)...)
	header = append(header, byte(backupSaltLen))
	header = append(header, salt...)
	header = append(header, iv...)
	if _, err := out.Write(header); err != nil {
		return 0, err
	}
	mac.Write(header)

	// HMAC-then-write tee around AES-CTR ciphertext.
	stream := cipher.NewCTR(block, iv)
	encWriter := &cipherWriter{w: out, stream: stream, mac: mac}

	gz := gzip.NewWriter(encWriter)

	cmd := exec.CommandContext(ctx, "pg_dump",
		"--format=custom",
		"--no-owner",
		"--no-acl",
		"--host="+s.cfg.DBHost,
		"--port="+s.cfg.DBPort,
		"--username="+s.cfg.DBUser,
		"--dbname="+s.cfg.DBName,
	)
	cmd.Env = append(os.Environ(), "PGPASSWORD="+s.cfg.DBPassword)
	cmd.Stdout = gz
	stderr := &strings.Builder{}
	cmd.Stderr = stderr
	if err := cmd.Run(); err != nil {
		return 0, fmt.Errorf("pg_dump failed: %w: %s", err, stderr.String())
	}
	if err := gz.Close(); err != nil {
		return 0, err
	}

	tag := mac.Sum(nil)
	if _, err := out.Write(tag); err != nil {
		return 0, err
	}

	info, err := out.Stat()
	if err != nil {
		return 0, err
	}
	return info.Size(), nil
}

type cipherWriter struct {
	w      io.Writer
	stream cipher.Stream
	mac    interface {
		Write(p []byte) (int, error)
	}
}

func (c *cipherWriter) Write(p []byte) (int, error) {
	buf := make([]byte, len(p))
	c.stream.XORKeyStream(buf, p)
	c.mac.Write(buf)
	if _, err := c.w.Write(buf); err != nil {
		return 0, err
	}
	return len(p), nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o640)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func (s *BackupService) s3Client(settings *model.BackupSettings) (*minio.Client, error) {
	if settings.S3Endpoint == nil || settings.S3AccessKeyEncrypted == nil || settings.S3SecretKeyEncrypted == nil {
		return nil, fmt.Errorf("s3 credentials not configured")
	}
	endpoint := strings.TrimSpace(*settings.S3Endpoint)
	// Allow users to paste full URLs with scheme; minio-go wants host[:port].
	if u, err := url.Parse(endpoint); err == nil && u.Host != "" {
		endpoint = u.Host
	}
	region := ""
	if settings.S3Region != nil {
		region = *settings.S3Region
	}
	return minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(*settings.S3AccessKeyEncrypted, *settings.S3SecretKeyEncrypted, ""),
		Secure: settings.S3UseSSL,
		Region: region,
	})
}

func s3ObjectKey(settings *model.BackupSettings, filename string) string {
	prefix := ""
	if settings.S3Prefix != nil {
		prefix = strings.TrimSuffix(strings.TrimPrefix(*settings.S3Prefix, "/"), "/")
	}
	if prefix == "" {
		return filename
	}
	return prefix + "/" + filename
}

func (s *BackupService) uploadToS3(ctx context.Context, settings *model.BackupSettings, srcPath, filename string) (string, error) {
	client, err := s.s3Client(settings)
	if err != nil {
		return "", err
	}
	bucket := *settings.S3Bucket
	key := s3ObjectKey(settings, filename)
	f, err := os.Open(srcPath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return "", err
	}
	_, err = client.PutObject(ctx, bucket, key, f, info.Size(), minio.PutObjectOptions{
		ContentType: "application/octet-stream",
	})
	if err != nil {
		return "", err
	}
	return key, nil
}

// TestS3 verifies connectivity using either currently-saved credentials or
// freshly-supplied ones from the admin form (so the user can test before save).
func (s *BackupService) TestS3(ctx context.Context, override *model.UpsertBackupSettingsInput) error {
	settings, err := s.repo.GetSettings(ctx)
	if err != nil {
		return err
	}
	merged := *settings
	if override != nil {
		if override.S3Endpoint != nil {
			merged.S3Endpoint = override.S3Endpoint
		}
		if override.S3Region != nil {
			merged.S3Region = override.S3Region
		}
		if override.S3Bucket != nil {
			merged.S3Bucket = override.S3Bucket
		}
		merged.S3UseSSL = override.S3UseSSL
		merged.S3PathStyle = override.S3PathStyle
		if override.S3AccessKey != nil && strings.TrimSpace(*override.S3AccessKey) != "" {
			merged.S3AccessKeyEncrypted = override.S3AccessKey
		}
		if override.S3SecretKey != nil && strings.TrimSpace(*override.S3SecretKey) != "" {
			merged.S3SecretKeyEncrypted = override.S3SecretKey
		}
	}
	if merged.S3Bucket == nil || *merged.S3Bucket == "" {
		return fmt.Errorf("s3_bucket required")
	}
	client, err := s.s3Client(&merged)
	if err != nil {
		return err
	}
	exists, err := client.BucketExists(ctx, *merged.S3Bucket)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("bucket %q not accessible", *merged.S3Bucket)
	}
	return nil
}

// OpenRun returns a reader for the encrypted backup artifact identified by
// run id. Tries local first, then S3.
func (s *BackupService) OpenRun(ctx context.Context, id string) (io.ReadCloser, *model.BackupRun, error) {
	run, err := s.repo.GetRun(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	if run.LocalPath != nil {
		f, err := os.Open(*run.LocalPath)
		if err == nil {
			return f, run, nil
		}
	}
	if run.S3Key != nil {
		settings, err := s.repo.GetSettings(ctx)
		if err != nil {
			return nil, run, err
		}
		client, err := s.s3Client(settings)
		if err != nil {
			return nil, run, err
		}
		obj, err := client.GetObject(ctx, *settings.S3Bucket, *run.S3Key, minio.GetObjectOptions{})
		if err != nil {
			return nil, run, err
		}
		return obj, run, nil
	}
	return nil, run, fmt.Errorf("backup file not found locally or in s3")
}

// DeleteRun removes the artifact from local + S3 (best effort) and the row.
func (s *BackupService) DeleteRun(ctx context.Context, id string) error {
	run, err := s.repo.GetRun(ctx, id)
	if err != nil {
		return err
	}
	if run.LocalPath != nil {
		_ = os.Remove(*run.LocalPath)
	}
	if run.S3Key != nil {
		settings, err := s.repo.GetSettings(ctx)
		if err == nil && settings.S3Bucket != nil {
			client, err := s.s3Client(settings)
			if err == nil {
				_ = client.RemoveObject(ctx, *settings.S3Bucket, *run.S3Key, minio.RemoveObjectOptions{})
			}
		}
	}
	return s.repo.DeleteRun(ctx, id)
}

// RestoreFromRun restores from a backup file currently stored in local/S3.
// Synchronous and destructive — caller must enforce the confirm flag.
func (s *BackupService) RestoreFromRun(ctx context.Context, id string) error {
	rc, _, err := s.OpenRun(ctx, id)
	if err != nil {
		return err
	}
	defer rc.Close()
	return s.RestoreFromReader(ctx, rc)
}

// RestoreFromReader decrypts + ungzips + pipes into pg_restore.
func (s *BackupService) RestoreFromReader(ctx context.Context, r io.Reader) error {
	settings, err := s.repo.GetSettings(ctx)
	if err != nil {
		return err
	}
	if settings.PassphraseEncrypted == nil || *settings.PassphraseEncrypted == "" {
		return ErrNoPassphrase
	}
	passphrase := *settings.PassphraseEncrypted

	plainGz, err := decryptStream(r, passphrase)
	if err != nil {
		return err
	}
	gz, err := gzip.NewReader(plainGz)
	if err != nil {
		return fmt.Errorf("%w: gzip header: %v", ErrInvalidBackupFile, err)
	}
	defer gz.Close()

	cmd := exec.CommandContext(ctx, "pg_restore",
		"--clean",
		"--if-exists",
		"--no-owner",
		"--no-acl",
		"--host="+s.cfg.DBHost,
		"--port="+s.cfg.DBPort,
		"--username="+s.cfg.DBUser,
		"--dbname="+s.cfg.DBName,
	)
	cmd.Env = append(os.Environ(), "PGPASSWORD="+s.cfg.DBPassword)
	cmd.Stdin = gz
	stderr := &strings.Builder{}
	cmd.Stderr = stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("pg_restore failed: %w: %s", err, stderr.String())
	}
	return nil
}

// decryptStream reads the header, derives keys, verifies HMAC, and returns a
// reader that yields the decrypted (still-gzipped) stream. Implementation
// loads the full payload into memory because pg_restore needs a seekable-ish
// stream and our backups are small enough; this keeps the HMAC check correct
// (must verify before yielding plaintext to pg_restore).
func decryptStream(r io.Reader, passphrase string) (io.Reader, error) {
	all, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	headerLen := len(backupMagic) + 1 + backupSaltLen + aes.BlockSize
	if len(all) < headerLen+backupHMACBytes {
		return nil, ErrInvalidBackupFile
	}
	if string(all[:len(backupMagic)]) != backupMagic {
		return nil, fmt.Errorf("%w: bad magic", ErrInvalidBackupFile)
	}
	saltLen := int(all[len(backupMagic)])
	if saltLen != backupSaltLen {
		return nil, fmt.Errorf("%w: unexpected salt length", ErrInvalidBackupFile)
	}
	salt := all[len(backupMagic)+1 : len(backupMagic)+1+saltLen]
	iv := all[len(backupMagic)+1+saltLen : headerLen]
	body := all[headerLen : len(all)-backupHMACBytes]
	tag := all[len(all)-backupHMACBytes:]

	keys := pbkdf2.Key([]byte(passphrase), salt, backupKeyIter, backupKeyLen, sha256.New)
	encKey, macKey := keys[:32], keys[32:]

	mac := hmac.New(sha256.New, macKey)
	mac.Write(all[:headerLen])
	mac.Write(body)
	expected := mac.Sum(nil)
	if subtle.ConstantTimeCompare(expected, tag) != 1 {
		return nil, ErrWrongPassphrase
	}

	block, err := aes.NewCipher(encKey)
	if err != nil {
		return nil, err
	}
	stream := cipher.NewCTR(block, iv)
	plain := make([]byte, len(body))
	stream.XORKeyStream(plain, body)
	return strings.NewReader(string(plain)), nil
}

// prune deletes backups exceeding retain_count or older than retain_days from
// both local disk and S3, then removes the corresponding backup_runs rows.
func (s *BackupService) prune(ctx context.Context, settings *model.BackupSettings) error {
	runs, err := s.repo.ListSuccessfulRunsForRetention(ctx)
	if err != nil {
		return err
	}
	sort.SliceStable(runs, func(i, j int) bool { return runs[i].StartedAt.After(runs[j].StartedAt) })

	cutoff := time.Time{}
	if settings.RetainDays > 0 {
		cutoff = time.Now().Add(-time.Duration(settings.RetainDays) * 24 * time.Hour)
	}

	var toDelete []*model.BackupRun
	for i, run := range runs {
		switch {
		case settings.RetainCount > 0 && i >= settings.RetainCount:
			toDelete = append(toDelete, run)
		case !cutoff.IsZero() && run.StartedAt.Before(cutoff):
			toDelete = append(toDelete, run)
		}
	}
	for _, run := range toDelete {
		if err := s.DeleteRun(ctx, run.ID); err != nil {
			s.log.Warn().Err(err).Str("id", run.ID).Msg("backup prune: delete failed")
		}
	}
	return nil
}
