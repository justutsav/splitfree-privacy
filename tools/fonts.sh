#!/bin/sh
# Rebuilds assets/fonts from Google's latin / latin-ext woff2 files (Anek Latin,
# Literata; OFL), kept outside the repo: FONTS_SRC=<dir with them> tools/fonts.sh
# Needs fonttools + brotli (pip install --user fonttools brotli). If the pages
# start using a character outside BASIC below, add it here and in fonts.css.
set -e
SRC=${FONTS_SRC:?set FONTS_SRC}; OUT=$(dirname "$0")/../assets/fonts
BASIC="U+0020-007E,U+00A0,U+00B7,U+00D7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026,U+2192"
OPT="--flavor=woff2 --layout-features+=tnum,lnum,pnum,case --no-hinting --desubroutinize"
cut() { pyftsubset "$SRC/$1" --unicodes="$2" $OPT --output-file="$OUT/$3"; }
cut anek-latin-normal-latin.woff2 "$BASIC" anek-latin.woff2
cut anek-latin-normal-latin-ext.woff2 U+20B9 anek-latin-rupee.woff2
cut literata-normal-latin.woff2 "$BASIC" literata.woff2
cut literata-normal-latin-ext.woff2 U+20B9 literata-rupee.woff2
cut literata-italic-latin.woff2 "$BASIC" literata-italic.woff2
cut literata-italic-latin-ext.woff2 U+20B9 literata-italic-rupee.woff2
