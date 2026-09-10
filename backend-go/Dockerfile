FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install dependencies
COPY go.mod ./
# COPY go.sum ./ (Uncomment later when go.sum is generated)
# RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Production image
FROM alpine:latest

WORKDIR /app

# Copy the built executable
COPY --from=builder /app/main .

# Expose port
EXPOSE 8080

# Run the executable
CMD ["./main"]
