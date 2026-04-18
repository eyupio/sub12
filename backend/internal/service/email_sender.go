package service

import (
	"context"
	"crypto/tls"
	"fmt"
	"math/rand"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/email"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

type EmailSenderService struct {
	smtpRepo     *repository.SMTPRepository
	templateRepo *repository.EmailTemplateRepository
	renderer     *email.Renderer
	log          zerolog.Logger
}

func NewEmailSenderService(smtpRepo *repository.SMTPRepository, templateRepo *repository.EmailTemplateRepository, renderer *email.Renderer, log zerolog.Logger) *EmailSenderService {
	return &EmailSenderService{smtpRepo: smtpRepo, templateRepo: templateRepo, renderer: renderer, log: log}
}

func (s *EmailSenderService) SendForgotPassword(ctx context.Context, toEmail, displayName, resetLink string, expiresAt time.Time) error {
	tpl, err := s.templateRepo.GetByKey(ctx, "forgot_password")
	if err != nil {
		return fmt.Errorf("load forgot_password template: %w", err)
	}
	if !tpl.IsEnabled {
		s.log.Warn().Msg("forgot_password template disabled; skipping email send")
		return nil
	}
	payload := map[string]any{
		"display_name": displayName,
		"reset_link":   resetLink,
		"expires_at":   expiresAt.UTC().Format("2 January 2006 at 15:04 UTC"),
	}
	subject, err := s.renderer.RenderSubject(tpl.SubjectTemplate, payload)
	if err != nil {
		return fmt.Errorf("render forgot_password subject: %w", err)
	}
	textBody, err := s.renderer.RenderText(tpl.TextTemplate, payload)
	if err != nil {
		return fmt.Errorf("render forgot_password text: %w", err)
	}
	htmlBody, err := s.renderer.RenderHTML(tpl.HTMLTemplate, payload)
	if err != nil {
		return fmt.Errorf("render forgot_password html: %w", err)
	}

	return s.sendRenderedTemplate(ctx, toEmail, subject, textBody, htmlBody)
}

// SendReportFiledNotification renders and sends the "content flagged" email
// to a single admin. The template is admin-editable; disabled by default.
// Errors are returned so callers can decide whether to log-and-continue.
func (s *EmailSenderService) SendReportFiledNotification(ctx context.Context, toEmail, displayName, communityName, targetLabel, reason, reportLink string) error {
	tpl, err := s.templateRepo.GetByKey(ctx, "notification_report_filed")
	if err != nil {
		return fmt.Errorf("load notification_report_filed template: %w", err)
	}
	if !tpl.IsEnabled {
		return nil
	}
	payload := map[string]any{
		"display_name":   displayName,
		"community_name": communityName,
		"target_label":   targetLabel,
		"reason":         reason,
		"report_link":    reportLink,
	}
	subject, err := s.renderer.RenderSubject(tpl.SubjectTemplate, payload)
	if err != nil {
		return fmt.Errorf("render notification_report_filed subject: %w", err)
	}
	textBody, err := s.renderer.RenderText(tpl.TextTemplate, payload)
	if err != nil {
		return fmt.Errorf("render notification_report_filed text: %w", err)
	}
	htmlBody, err := s.renderer.RenderHTML(tpl.HTMLTemplate, payload)
	if err != nil {
		return fmt.Errorf("render notification_report_filed html: %w", err)
	}

	return s.sendRenderedTemplate(ctx, toEmail, subject, textBody, htmlBody)
}

func (s *EmailSenderService) SendEmailChangeConfirmation(ctx context.Context, toEmail, displayName, confirmLink string, expiresAt time.Time) error {
	tpl, err := s.templateRepo.GetByKey(ctx, "email_change_confirm")
	if err != nil {
		return fmt.Errorf("load email_change_confirm template: %w", err)
	}
	if !tpl.IsEnabled {
		s.log.Warn().Msg("email_change_confirm template disabled; skipping email send")
		return nil
	}
	payload := map[string]any{
		"display_name": displayName,
		"confirm_link": confirmLink,
		"expires_at":   expiresAt.UTC().Format("2 January 2006 at 15:04 UTC"),
	}
	subject, err := s.renderer.RenderSubject(tpl.SubjectTemplate, payload)
	if err != nil {
		return fmt.Errorf("render email_change_confirm subject: %w", err)
	}
	textBody, err := s.renderer.RenderText(tpl.TextTemplate, payload)
	if err != nil {
		return fmt.Errorf("render email_change_confirm text: %w", err)
	}
	htmlBody, err := s.renderer.RenderHTML(tpl.HTMLTemplate, payload)
	if err != nil {
		return fmt.Errorf("render email_change_confirm html: %w", err)
	}

	return s.sendRenderedTemplate(ctx, toEmail, subject, textBody, htmlBody)
}

// SendNotification sends a generic notification email to toEmail using the
// `notification_generic` template. The provided subject and body are injected
// as `notification_title` and `notification_body` placeholders respectively.
func (s *EmailSenderService) SendNotification(ctx context.Context, toEmail, displayName, subject, body string) error {
	tpl, err := s.templateRepo.GetByKey(ctx, "notification_generic")
	if err != nil {
		return fmt.Errorf("load notification_generic template: %w", err)
	}
	if !tpl.IsEnabled {
		s.log.Warn().Msg("notification_generic template disabled; skipping email send")
		return nil
	}
	payload := map[string]any{
		"display_name":       displayName,
		"notification_title": subject,
		"notification_body":  body,
	}
	renderedSubject, err := s.renderer.RenderSubject(tpl.SubjectTemplate, payload)
	if err != nil {
		return fmt.Errorf("render notification subject: %w", err)
	}
	textBody, err := s.renderer.RenderText(tpl.TextTemplate, payload)
	if err != nil {
		return fmt.Errorf("render notification text: %w", err)
	}
	htmlBody, err := s.renderer.RenderHTML(tpl.HTMLTemplate, payload)
	if err != nil {
		return fmt.Errorf("render notification html: %w", err)
	}

	return s.sendRenderedTemplate(ctx, toEmail, renderedSubject, textBody, htmlBody)
}

func (s *EmailSenderService) SendTicketCreatedConfirmation(ctx context.Context, toEmail, displayName, ticketID, ticketTitle, ticketLink string) error {
	return s.sendTicketTemplate(ctx, toEmail, "ticket_created_confirmation", map[string]any{
		"display_name": displayName,
		"ticket_id":    ticketID,
		"ticket_title": ticketTitle,
		"ticket_link":  ticketLink,
		"brand_name":   "sub12.io",
		"product_name": "sub12.io",
		"cta_label":    "View ticket",
	})
}

func (s *EmailSenderService) SendTicketNewReply(ctx context.Context, toEmail, displayName, actorName, ticketID, ticketTitle, ticketLink string) error {
	return s.sendTicketTemplate(ctx, toEmail, "ticket_new_reply", map[string]any{
		"display_name": displayName,
		"actor_name":   actorName,
		"ticket_id":    ticketID,
		"ticket_title": ticketTitle,
		"ticket_link":  ticketLink,
		"brand_name":   "sub12.io",
		"product_name": "sub12.io",
		"cta_label":    "View ticket",
	})
}

func (s *EmailSenderService) SendTicketAssigned(ctx context.Context, toEmail, displayName, actorName, ticketID, ticketTitle, ticketLink string) error {
	return s.sendTicketTemplate(ctx, toEmail, "ticket_assigned", map[string]any{
		"display_name": displayName,
		"actor_name":   actorName,
		"ticket_id":    ticketID,
		"ticket_title": ticketTitle,
		"ticket_link":  ticketLink,
		"brand_name":   "sub12.io",
		"product_name": "sub12.io",
		"cta_label":    "View ticket",
	})
}

func (s *EmailSenderService) SendTicketStatusChanged(ctx context.Context, toEmail, displayName, actorName, ticketID, ticketTitle, fromStatus, toStatus, ticketLink string) error {
	return s.sendTicketTemplate(ctx, toEmail, "ticket_status_changed", map[string]any{
		"display_name":      displayName,
		"actor_name":        actorName,
		"ticket_id":         ticketID,
		"ticket_title":      ticketTitle,
		"from_status_label": fromStatus,
		"status_label":      toStatus,
		"ticket_link":       ticketLink,
		"brand_name":        "sub12.io",
		"product_name":      "sub12.io",
		"cta_label":         "View ticket",
	})
}

func (s *EmailSenderService) SendFeatureRequestAcceptedForRefinement(ctx context.Context, toEmail, displayName, actorName, ticketID, ticketTitle, statusLabel, ticketLink string) error {
	return s.sendTicketTemplate(ctx, toEmail, "feature_request_accepted_for_refinement", map[string]any{
		"display_name": displayName,
		"actor_name":   actorName,
		"ticket_id":    ticketID,
		"ticket_title": ticketTitle,
		"status_label": statusLabel,
		"ticket_link":  ticketLink,
		"brand_name":   "sub12.io",
		"product_name": "sub12.io",
		"cta_label":    "View ticket",
	})
}

func (s *EmailSenderService) sendTicketTemplate(ctx context.Context, toEmail, key string, payload map[string]any) error {
	tpl, err := s.templateRepo.GetByKey(ctx, key)
	if err != nil {
		return fmt.Errorf("load %s template: %w", key, err)
	}
	if !tpl.IsEnabled {
		return nil
	}
	subject, err := s.renderer.RenderSubject(tpl.SubjectTemplate, payload)
	if err != nil {
		return fmt.Errorf("render %s subject: %w", key, err)
	}
	textBody, err := s.renderer.RenderText(tpl.TextTemplate, payload)
	if err != nil {
		return fmt.Errorf("render %s text: %w", key, err)
	}
	htmlBody, err := s.renderer.RenderHTML(tpl.HTMLTemplate, payload)
	if err != nil {
		return fmt.Errorf("render %s html: %w", key, err)
	}
	return s.sendRenderedTemplate(ctx, toEmail, subject, textBody, htmlBody)
}

func (s *EmailSenderService) sendRenderedTemplate(ctx context.Context, toEmail, subject, textBody, htmlBody string) error {
	settings, err := s.smtpRepo.GetSMTPSettings(ctx)
	if err != nil {
		return fmt.Errorf("load smtp settings: %w", err)
	}
	fromName := "sub12.io"
	if settings.FromName != nil && strings.TrimSpace(*settings.FromName) != "" {
		fromName = strings.TrimSpace(*settings.FromName)
	}
	from := fmt.Sprintf("%s <%s>", fromName, settings.FromEmail)
	return s.sendSMTP(settings.Host, settings.Port, settings.Username, settings.PasswordEncrypted, settings.UseTLS, settings.UseSTARTTLS, settings.FromEmail, toEmail, buildMultipartMsg(from, toEmail, subject, textBody, htmlBody))
}

func buildMultipartMsg(from, to, subject, textBody, htmlBody string) []byte {
	boundary := fmt.Sprintf("=_sub12_%x", rand.Int63())
	msg := strings.Builder{}
	msg.WriteString("From: " + from + "\r\n")
	msg.WriteString("To: " + to + "\r\n")
	msg.WriteString("Subject: " + subject + "\r\n")
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: multipart/alternative; boundary=\"" + boundary + "\"\r\n")
	msg.WriteString("\r\n")
	msg.WriteString("--" + boundary + "\r\n")
	msg.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(textBody + "\r\n")
	msg.WriteString("--" + boundary + "\r\n")
	msg.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(htmlBody + "\r\n")
	msg.WriteString("--" + boundary + "--\r\n")
	return []byte(msg.String())
}

func (s *EmailSenderService) SendTestEmail(ctx context.Context) error {
	settings, err := s.smtpRepo.GetSMTPSettings(ctx)
	if err != nil {
		return fmt.Errorf("load smtp settings: %w", err)
	}

	fromName := "sub12.io"
	if settings.FromName != nil && strings.TrimSpace(*settings.FromName) != "" {
		fromName = strings.TrimSpace(*settings.FromName)
	}
	from := fmt.Sprintf("%s <%s>", fromName, settings.FromEmail)

	msg := strings.Builder{}
	msg.WriteString("From: " + from + "\r\n")
	msg.WriteString("To: " + settings.FromEmail + "\r\n")
	msg.WriteString("Subject: sub12.io SMTP Test\r\n")
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	msg.WriteString("\r\n")
	msg.WriteString("This is a test email from sub12.io to verify your SMTP configuration is working correctly.")

	return s.sendSMTP(settings.Host, settings.Port, settings.Username, settings.PasswordEncrypted, settings.UseTLS, settings.UseSTARTTLS, settings.FromEmail, settings.FromEmail, []byte(msg.String()))
}

func (s *EmailSenderService) sendSMTP(host string, port int, username, password *string, useTLS, useSTARTTLS bool, from, to string, msg []byte) error {
	addr := net.JoinHostPort(host, fmt.Sprintf("%d", port))

	if !useTLS && !useSTARTTLS {
		var auth smtp.Auth
		if username != nil && *username != "" && password != nil {
			auth = smtp.PlainAuth("", *username, *password, host)
		}
		return smtp.SendMail(addr, auth, from, []string{to}, msg)
	}

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		return fmt.Errorf("dial smtp: %w", err)
	}

	if useTLS {
		tlsConn := tls.Client(conn, &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12})
		if err := tlsConn.Handshake(); err != nil {
			return fmt.Errorf("smtp tls handshake: %w", err)
		}
		conn = tlsConn
	}

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("new smtp client: %w", err)
	}
	defer client.Quit()

	if useSTARTTLS {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return fmt.Errorf("smtp server does not support STARTTLS")
		}
		if err := client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	}

	if username != nil && *username != "" && password != nil {
		auth := smtp.PlainAuth("", *username, *password, host)
		if ok, _ := client.Extension("AUTH"); ok {
			if err := client.Auth(auth); err != nil {
				return fmt.Errorf("smtp auth: %w", err)
			}
		}
	}

	if err := client.Mail(from); err != nil {
		return fmt.Errorf("smtp mail from: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp rcpt to: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("smtp write message: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp finalize message: %w", err)
	}
	return nil
}
