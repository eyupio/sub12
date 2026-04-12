package email

import (
	"bytes"
	htmltpl "html/template"
	texttpl "text/template"
)

const layout = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr>
        <td style="background:#18181b;padding:24px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.05em;">Sub-12</span>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;color:#18181b;font-size:15px;line-height:1.7;">
          {{.content}}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">
          Sub-12 &mdash; Target Shooting Companion &nbsp;&middot;&nbsp;
          <a href="https://sub12.io" style="color:#71717a;text-decoration:none;">sub12.io</a>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

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
	contentTpl, err := htmltpl.New("content").Option("missingkey=error").Parse(htmlTemplate)
	if err != nil {
		return "", err
	}
	var contentBuf bytes.Buffer
	if err := contentTpl.Execute(&contentBuf, payload); err != nil {
		return "", err
	}

	layoutTpl, err := htmltpl.New("layout").Parse(layout)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := layoutTpl.Execute(&buf, map[string]any{
		"content": htmltpl.HTML(contentBuf.String()),
	}); err != nil {
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
