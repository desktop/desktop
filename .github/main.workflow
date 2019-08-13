workflow "New workflow" {
  resolves = ["HTTP client", "GitHub Action for Heroku"]
  on = "create"
}

action "HTTP client" {
  uses = "swinton/httpie.action@69125d73caa2c6821f6a41a86112777a37adc171"
}

action "GitHub Action for Google Cloud" {
  uses = "actions/gcloud/cli@dc2b6c3bc6efde1869a9d4c21fcad5c125d19b81"
}

action "GitHub Action for Heroku" {
  uses = "actions/heroku@466fea5e8253586a6df75b10e95447b0bfe383c1"
  needs = ["GitHub Action for Google Cloud"]
}
