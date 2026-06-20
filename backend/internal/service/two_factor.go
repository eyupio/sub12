package service

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"errors"
	"fmt"
	"time"

	"github.com/pquerna/otp/totp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"golang.org/x/crypto/bcrypt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrTOTPNotEnrolled        = errors.New("totp not enrolled")
	ErrTOTPAlreadyEnrolled    = errors.New("totp already enrolled")
	ErrInvalidTOTP            = errors.New("invalid totp code")
	ErrPendingEnrollExpired   = errors.New("totp enrollment expired or not started")
	ErrTOTPReauthRequired     = errors.New("password or current 2fa code required")
	ErrTOTPReauthInvalid      = errors.New("invalid password or 2fa code")
)

const (
	pendingEnrollPrefix = "2fa_pending:"
	pendingEnrollTTL    = 10 * time.Minute
	backupCodeCount     = 10
	backupCodeBytes     = 5 // 5 random bytes -> 8 base32 chars
)

type TwoFactorService struct {
	users  *repository.UserRepository
	tf     *repository.TwoFactorRepository
	redis  *redis.Client
	log    zerolog.Logger
	issuer string
}

func NewTwoFactorService(
	users *repository.UserRepository,
	tf *repository.TwoFactorRepository,
	rdb *redis.Client,
	log zerolog.Logger,
	issuer string,
) *TwoFactorService {
	if issuer == "" {
		issuer = "SUB12"
	}
	return &TwoFactorService{users: users, tf: tf, redis: rdb, log: log, issuer: issuer}
}

// BeginEnroll generates a fresh TOTP secret for the user and stores it in
// Redis under a short TTL. It is NOT persisted to the users row until the
// user proves possession of the secret by submitting a valid code.
func (s *TwoFactorService) BeginEnroll(ctx context.Context, userID string) (*model.TOTPEnrollBegin, error) {
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user.TOTPEnabled {
		return nil, ErrTOTPAlreadyEnrolled
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      s.issuer,
		AccountName: user.Email,
	})
	if err != nil {
		return nil, fmt.Errorf("generate totp key: %w", err)
	}

	if err := s.redis.Set(ctx, pendingEnrollPrefix+userID, key.Secret(), pendingEnrollTTL).Err(); err != nil {
		return nil, fmt.Errorf("store pending totp secret: %w", err)
	}

	return &model.TOTPEnrollBegin{
		Secret:      key.Secret(),
		OtpauthURI:  key.URL(),
		Issuer:      s.issuer,
		AccountName: user.Email,
	}, nil
}

// ConfirmEnroll validates the user-supplied code against the pending secret,
// persists the secret, generates and stores backup codes, and returns them
// in plaintext. The plaintext codes are shown to the user exactly once.
func (s *TwoFactorService) ConfirmEnroll(ctx context.Context, userID, code string) ([]string, error) {
	secret, err := s.redis.Get(ctx, pendingEnrollPrefix+userID).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, ErrPendingEnrollExpired
		}
		return nil, fmt.Errorf("read pending totp secret: %w", err)
	}

	if !totp.Validate(code, secret) {
		return nil, ErrInvalidTOTP
	}

	if err := s.tf.SetSecretAndEnable(ctx, userID, secret); err != nil {
		return nil, err
	}

	plain, hashes, err := generateBackupCodes(backupCodeCount)
	if err != nil {
		return nil, err
	}
	if err := s.tf.InsertBackupCodes(ctx, userID, hashes); err != nil {
		return nil, err
	}

	if err := s.redis.Del(ctx, pendingEnrollPrefix+userID).Err(); err != nil {
		s.log.Error().Err(err).Str("event", "pending_enroll_cleanup_failed").Str("user_id", userID).Msg("audit")
	}
	s.log.Info().Str("event", "totp_enabled").Str("user_id", userID).Msg("audit")
	return plain, nil
}

// Disable removes 2FA from the account. Re-authentication is required: the
// caller may supply either their current account password or a current TOTP
// or backup code.
func (s *TwoFactorService) Disable(ctx context.Context, userID, password, code string) error {
	if password == "" && code == "" {
		return ErrTOTPReauthRequired
	}

	if password != "" {
		user, err := s.users.GetByID(ctx, userID)
		if err != nil {
			return err
		}
		if user.PasswordHash == nil {
			return ErrTOTPReauthInvalid
		}
		if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(password)); err != nil {
			return ErrTOTPReauthInvalid
		}
	} else {
		if err := s.VerifyTOTPOrBackup(ctx, userID, code); err != nil {
			return ErrTOTPReauthInvalid
		}
	}

	if err := s.tf.Disable(ctx, userID); err != nil {
		return err
	}
	if err := s.tf.DeleteAll(ctx, userID); err != nil {
		return err
	}
	s.log.Info().Str("event", "totp_disabled").Str("user_id", userID).Msg("audit")
	return nil
}

// RegenerateBackupCodes invalidates all existing backup codes and issues a
// fresh batch. Requires a valid current TOTP code so a stolen access token
// alone cannot lock a user out by burning their recovery codes.
func (s *TwoFactorService) RegenerateBackupCodes(ctx context.Context, userID, code string) ([]string, error) {
	secret, enabled, err := s.tf.GetSecret(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !enabled || secret == "" {
		return nil, ErrTOTPNotEnrolled
	}
	if !totp.Validate(code, secret) {
		return nil, ErrInvalidTOTP
	}
	if err := s.tf.DeleteAll(ctx, userID); err != nil {
		return nil, err
	}
	plain, hashes, err := generateBackupCodes(backupCodeCount)
	if err != nil {
		return nil, err
	}
	if err := s.tf.InsertBackupCodes(ctx, userID, hashes); err != nil {
		return nil, err
	}
	s.log.Info().Str("event", "totp_backup_codes_regenerated").Str("user_id", userID).Msg("audit")
	return plain, nil
}

// VerifyTOTPOrBackup tries the supplied code as a TOTP first, then as a
// backup code. A matching backup code is consumed (marked used) so it cannot
// be replayed.
func (s *TwoFactorService) VerifyTOTPOrBackup(ctx context.Context, userID, code string) error {
	secret, enabled, err := s.tf.GetSecret(ctx, userID)
	if err != nil {
		return err
	}
	if !enabled || secret == "" {
		return ErrTOTPNotEnrolled
	}

	if totp.Validate(code, secret) {
		return nil
	}

	hashes, err := s.tf.ListUnusedHashes(ctx, userID)
	if err != nil {
		return err
	}
	for _, h := range hashes {
		if bcrypt.CompareHashAndPassword([]byte(h), []byte(code)) == nil {
			ok, err := s.tf.ConsumeBackupCodeByHash(ctx, userID, h)
			if err != nil {
				return err
			}
			if ok {
				return nil
			}
		}
	}
	return ErrInvalidTOTP
}

func (s *TwoFactorService) Status(ctx context.Context, userID string) (*model.TOTPStatus, error) {
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	remaining := 0
	if user.TOTPEnabled {
		n, err := s.tf.CountUnused(ctx, userID)
		if err != nil {
			return nil, err
		}
		remaining = n
	}
	return &model.TOTPStatus{
		Enabled:              user.TOTPEnabled,
		EnrolledAt:           user.TOTPEnrolledAt,
		BackupCodesRemaining: remaining,
	}, nil
}

// generateBackupCodes returns paired plaintext codes and bcrypt-hashed codes.
// Plaintext is shown once; only hashes are stored.
func generateBackupCodes(n int) ([]string, []string, error) {
	plain := make([]string, 0, n)
	hashes := make([]string, 0, n)
	for i := 0; i < n; i++ {
		buf := make([]byte, backupCodeBytes)
		if _, err := rand.Read(buf); err != nil {
			return nil, nil, fmt.Errorf("generate backup code: %w", err)
		}
		code := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf)
		hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
		if err != nil {
			return nil, nil, fmt.Errorf("hash backup code: %w", err)
		}
		plain = append(plain, code)
		hashes = append(hashes, string(hash))
	}
	return plain, hashes, nil
}
