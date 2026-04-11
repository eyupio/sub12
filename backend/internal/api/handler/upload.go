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
// returns the raw bytes and a normalised content type. It uses
// http.DetectContentType (magic-byte sniffing) instead of trusting the
// Content-Type header, which is unreliable on mobile browsers (e.g. HEIC).
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
	if !ok {
		// Fall back to the multipart header — some formats (HEIC, WebP)
		// are not recognised by Go's DetectContentType.
		_, hdr, _ := r.FormFile(fieldName)
		if hdr != nil {
			headerCT := hdr.Header.Get("Content-Type")
			contentType, ok = normaliseImageType(headerCT)
		}
	}
	if !ok {
		return nil, "", ErrUnsupportedType
	}

	return data, contentType, nil
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
	case ct == "application/octet-stream":
		// Some mobile browsers send this for camera captures; treat as JPEG.
		return "image/jpeg", true
	default:
		return "", false
	}
}
