package handler

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type deadlineRecorder struct {
	*httptest.ResponseRecorder
	readDeadline  time.Time
	writeDeadline time.Time
}

func (r *deadlineRecorder) SetReadDeadline(deadline time.Time) error {
	r.readDeadline = deadline
	return nil
}

func (r *deadlineRecorder) SetWriteDeadline(deadline time.Time) error {
	r.writeDeadline = deadline
	return nil
}

func TestExtendBackupRestoreDeadlines(t *testing.T) {
	recorder := &deadlineRecorder{ResponseRecorder: httptest.NewRecorder()}
	before := time.Now().Add(backupRestoreTimeout)

	extendBackupRestoreDeadlines(recorder, true)

	after := time.Now().Add(backupRestoreTimeout)
	assert.False(t, recorder.readDeadline.Before(before))
	assert.False(t, recorder.readDeadline.After(after))
	assert.False(t, recorder.writeDeadline.Before(before))
	assert.False(t, recorder.writeDeadline.After(after))
}

func TestNginx_BackupRestoreAllowsLargeSlowUploads(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "frontend", "nginx.conf"))
	if err != nil {
		t.Skipf("nginx.conf not readable from this checkout: %v", err)
	}
	conf := string(raw)
	start := strings.Index(conf, "location ~ ^/api/v1/(admin/backup/restore/upload|setup/restore)$ {")
	require.NotEqual(t, -1, start, "dedicated backup-restore location missing")
	body := conf[start:]
	if end := strings.Index(body, "\n    }"); end != -1 {
		body = body[:end]
	}

	assert.Contains(t, body, "client_max_body_size 513m;")
	assert.Contains(t, body, "client_body_timeout 30m;")
	assert.Contains(t, body, "proxy_request_buffering off;")
	assert.Contains(t, body, "proxy_read_timeout 30m;")
	assert.Contains(t, body, "proxy_send_timeout 30m;")
}
