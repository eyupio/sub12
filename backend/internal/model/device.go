package model

import "time"

// DeviceToken is a registered push-notification token for one device.
type DeviceToken struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Token     string    `json:"token"`
	Platform  string    `json:"platform"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// RegisterDeviceInput is the payload to register or refresh a device push token.
type RegisterDeviceInput struct {
	Token    string `json:"token"`
	Platform string `json:"platform"`
}
