# GCS remote state. The bucket name can't be interpolated from a variable
# inside a `backend` block (Terraform limitation), so it's passed at `init`
# time instead:
#
#   terraform init -backend-config="bucket=<PROJECT_ID>-tfstate"
#
# Create the bucket once, per GCP project, before the first `init`:
#
#   gcloud storage buckets create gs://<PROJECT_ID>-tfstate --location=<region>
#
# It then persists across every future `terraform destroy` / `terraform
# apply` cycle — state survives cluster teardown, which is the whole point.
terraform {
  backend "gcs" {
    prefix = "vivexy-gke"
  }
}
