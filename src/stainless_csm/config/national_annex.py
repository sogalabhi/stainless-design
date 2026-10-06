"""Constants that are written inside Annex B itself.

Nothing from outside Annex B lives here or anywhere else in the engine: E, nu, gamma_M0, Omega and
each plate's k_sigma are inputs the user must give. There are no defaults and no suggestions.
"""

# The number 15 written inside Formula (B.14). It is part of Annex B itself, so it is a fixed
# constant of the formula (and deliberately not the same thing as the parameter Omega).
TENSION_STRAIN_RATIO_CAP = 15.0
