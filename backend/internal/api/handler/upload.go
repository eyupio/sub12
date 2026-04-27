package handler

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

var (
	ErrFileTooLarge    = errors.New("file too large")
	ErrMissingFile     = errors.New("missing image file")
	ErrUnsupportedType = errors.New("unsupported image type")
)

// parseAndValidateImage reads a multipart image upload, validates it, and
// returns the raw bytes and a normalised content type. Type is determined
// by magic-byte sniffing (http.DetectContentType + an HEIC sniffer); the
// client-supplied Content-Type header is not trusted.
func parseAndValidateImage(r *http.Request, fieldName string, maxBytes int64) ([]byte, string, error) {
	r.Body = http.MaxBytesReader(nil, r.Body, maxBytes)

	if err := r.ParseMultipartForm(maxBytes); err != nil {
		return nil, "", fmt.Errorf("%w: max %dMB", ErrFileTooLarge, maxBytes>>20)
	}

	file, _, err := r.FormFile(fieldName)
	if err != nil {
		return nil, "", ErrMissingFile
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return nil, "", fmt.Errorf("failed to read image: %w", err)
	}

	// Detect actual content type from file bytes (first 512 bytes).
	detected := http.DetectContentType(data)

	contentType, ok := normaliseImageType(detected)
	if !ok && isHEIC(data) {
		// Go's DetectContentType doesn't recognise HEIC/HEIF; sniff it ourselves.
		contentType, ok = normaliseImageType("image/heic")
	}
	if !ok {
		return nil, "", ErrUnsupportedType
	}

	return data, contentType, nil
}

// isHEIC reports whether data looks like an ISO base media file with an
// HEIC/HEIF brand. The structure is: 4 bytes box size, "ftyp", 4 bytes major
// brand, 4 bytes minor version, then compatible brands. We accept any of the
// known HEIC/HEIF major brands.
func isHEIC(data []byte) bool {
	if len(data) < 12 {
		return false
	}
	if string(data[4:8]) != "ftyp" {
		return false
	}
	switch string(data[8:12]) {
	case "heic", "heix", "heim", "heis", "hevc", "hevm", "hevs", "mif1", "msf1":
		return true
	}
	return false
}

// normaliseImageType maps a detected or header content type to one of the
// accepted storage types. Returns the normalised type and true, or ("", false).
func normaliseImageType(ct string) (string, bool) {
	ct = strings.ToLower(ct)
	switch {
	case strings.HasPrefix(ct, "image/jpeg"):
		return "image/jpeg", true
	case strings.HasPrefix(ct, "image/png"):
		return "image/png", true
	case strings.HasPrefix(ct, "image/webp"):
		return "image/webp", true
	case strings.HasPrefix(ct, "image/heic"),
		strings.HasPrefix(ct, "image/heif"):
		// HEIC from iOS — store as-is; browsers that captured it can display it.
		return "image/jpeg", true
	default:
		return "", false
	}
}
