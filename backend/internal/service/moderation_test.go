package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestTargetLabelFor(t *testing.T) {
	cases := map[string]string{
		"post":       "a post",
		"comment":    "a comment",
		"score_card": "a score card",
		"user":       "a user",
		"garbage":    "content",
	}
	for in, want := range cases {
		assert.Equal(t, want, targetLabelFor(in), "targetLabelFor(%q)", in)
	}
}
