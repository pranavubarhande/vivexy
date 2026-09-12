# Disabled Applications

Kept out of `../apps/` on purpose so `vivexy-root`'s `directory.recurse: true`
doesn't pick them up. This project's GCP quotas (SSD_TOTAL_GB, node CPU) only
have enough headroom for one full environment at a time — running staging
and prod simultaneously exhausts both and starves prod's own pods of
scheduling room.

To re-enable an environment, move its file(s) back into `../apps/` and push
to `main`; `vivexy-root` will pick it up on its next sync.
