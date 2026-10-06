import os

# Qt must not try to open a real display during tests.
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
