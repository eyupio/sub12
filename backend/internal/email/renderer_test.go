package email

import (
	"strings"
	"testing"
)

func TestRenderHTML_UsesSub12BrandTheme(t *testing.T) {
	r := NewRenderer()

	rendered, err := r.RenderHTML("<p>Hello {{.display_name}}</p>", map[string]any{"display_name": "Alex"})
	if err != nil {
		t.Fatalf("RenderHTML returned error: %v", err)
	}

	assertContains := func(needle string) {
		t.Helper()
		if !strings.Contains(rendered, needle) {
			t.Fatalf("expected rendered html to contain %q", needle)
		}
	}

	assertContains("sub12.io")
	assertContains("background:#0C0C0C")
	assertContains("color:#D4A44A")
	assertContains("Hello Alex")

	if strings.Contains(rendered, "Sub-12") {
		t.Fatalf("expected legacy Sub-12 brand text to be absent")
	}
}
