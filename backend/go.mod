module github.com/jnnngs/sub-12/backend

// Patch version, not just `1.25`: CI resolves its toolchain from this directive
// (`go-version-file: backend/go.mod`), so this line is what decides which
// stdlib the shipped binary is built against. `1.25` alone left us on 1.25.0,
// which govulncheck reported as reachable-vulnerable in crypto/tls, crypto/x509,
// net/http, net/url, net/mail, net/textproto, mime, encoding/asn1, encoding/xml
// and html/template — all called on unauthenticated request paths. Raise this
// floor whenever `make security` reports a new stdlib advisory; that is the
// whole fix for a stdlib finding.
go 1.25.13

require (
	github.com/alicebob/miniredis/v2 v2.38.0
	github.com/fogleman/gg v1.3.0
	github.com/go-chi/chi/v5 v5.3.1
	github.com/golang-jwt/jwt/v5 v5.3.1
	github.com/golang-migrate/migrate/v4 v4.19.1
	github.com/golang/freetype v0.0.0-20170609003504-e2365dfdc4a0
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.10.0
	github.com/kelseyhightower/envconfig v1.4.0
	github.com/minio/minio-go/v7 v7.3.0
	github.com/pquerna/otp v1.5.0
	github.com/redis/go-redis/v9 v9.22.0
	github.com/rs/zerolog v1.35.1
	github.com/stretchr/testify v1.11.1
	golang.org/x/crypto v0.55.0
	golang.org/x/image v0.45.0
)

require (
	github.com/boombuler/barcode v1.1.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/davecgh/go-spew v1.1.2-0.20180830191138-d8f796af33cc // indirect
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/jackc/pgerrcode v0.0.0-20220416144525-469b46aa5efa // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/klauspost/compress v1.19.2 // indirect
	github.com/klauspost/cpuid/v2 v2.4.0 // indirect
	github.com/klauspost/crc32 v1.3.0 // indirect
	github.com/kr/text v0.2.0 // indirect
	github.com/mattn/go-colorable v0.1.15 // indirect
	github.com/mattn/go-isatty v0.0.24 // indirect
	github.com/minio/crc64nvme v1.1.1 // indirect
	github.com/minio/md5-simd v1.1.2 // indirect
	github.com/philhofer/fwd v1.2.0 // indirect
	github.com/pmezard/go-difflib v1.0.1-0.20181226105442-5d4384ee4fb2 // indirect
	github.com/rs/xid v1.6.0 // indirect
	github.com/tinylib/msgp v1.6.4 // indirect
	github.com/yuin/gopher-lua v1.1.1 // indirect
	github.com/zeebo/xxh3 v1.1.0 // indirect
	go.uber.org/atomic v1.11.0 // indirect
	go.yaml.in/yaml/v3 v3.0.5 // indirect
	golang.org/x/net v0.58.0 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.41.0 // indirect
	gopkg.in/ini.v1 v1.67.3 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)
