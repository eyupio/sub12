package email

import (
	"bytes"
	htmltpl "html/template"
	texttpl "text/template"
)

type Renderer struct{}

func NewRenderer() *Renderer {
	return &Renderer{}
}

func (r *Renderer) RenderSubject(subjectTemplate string, payload map[string]any) (string, error) {
	return renderTextTemplate("subject", subjectTemplate, payload)
}

func (r *Renderer) RenderText(textTemplate string, payload map[string]any) (string, error) {
	return renderTextTemplate("text", textTemplate, payload)
}

func (r *Renderer) RenderHTML(htmlTemplate string, payload map[string]any) (string, error) {
	tpl, err := htmltpl.New("html").Option("missingkey=error").Parse(htmlTemplate)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tpl.Execute(&buf, payload); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func renderTextTemplate(name, body string, payload map[string]any) (string, error) {
	tpl, err := texttpl.New(name).Option("missingkey=error").Parse(body)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tpl.Execute(&buf, payload); err != nil {
		return "", err
	}
	return buf.String(), nil
}
