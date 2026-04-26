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
<body style="margin:0;padding:0;background:#0C0C0C;font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0C0C0C;padding:32px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#161616;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);box-shadow:0 20px 45px rgba(0,0,0,0.45);">
      <tr>
        <td style="background:linear-gradient(135deg,#111111,#161616);padding:24px 32px;border-bottom:1px solid rgba(212,164,74,0.35);">
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;letter-spacing:-0.01em;line-height:1;">
            <span style="color:#FFFFFF;">SUB</span><span style="color:#D4A44A;">12</span>
          </span>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;color:#F5F5F0;font-size:15px;line-height:1.7;">
          {{.content}}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.08);font-size:12px;color:#888888;">
          sub12.io &mdash; Target Shooting Companion &nbsp;&middot;&nbsp;
          <a href="https://sub12.io" style="color:#D4A44A;text-decoration:none;">sub12.io</a>
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
