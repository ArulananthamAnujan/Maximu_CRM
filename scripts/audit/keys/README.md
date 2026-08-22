# Test service-account keypair

Used only by `scripts/verify-features.sh` so the Google Drive stub can verify
the RS256 assertion this application signs. It grants access to nothing: it was
generated for the test harness and is not a Google credential.

Real credentials belong in `.dev.vars` (local) or the deployment's secrets, and
must never be committed.
