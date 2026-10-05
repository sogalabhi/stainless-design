"""Default values for E and the National Annex parameters (NDPs)."""

ELASTIC_MODULUS = 200_000.0  # N/mm², 5.1.5
GAMMA_M0 = 1.10  # partial factor, National Annex
OMEGA = 15.0  # strain-ratio cap Ω in B.6, National Annex (not the same symbol as the 15 in B.14)

# Fixed strain-ratio cap written as the number 15 in Formula (B.14). Deliberately not OMEGA:
# B.14 hard-codes it, while Ω (B.5/B.6) is a project-specific parameter a National Annex can change.
TENSION_STRAIN_RATIO_CAP = 15.0
