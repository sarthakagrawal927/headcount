#!/usr/bin/env python3
"""
WCAG contrast for the console's OKLCH tokens.

Written because eyeballing a dark theme does not work: --ink-faint looked fine
and measured 3.01:1 against the panel, which is a pass for large text and a
failure for the 11px labels it was actually used on. Run it after touching the
palette.

    python3 scripts/contrast.py
"""
import math

def oklch_to_srgb(L, C, H):
    h = math.radians(H)
    a, b = C*math.cos(h), C*math.sin(h)
    l_ = L + 0.3963377774*a + 0.2158037573*b
    m_ = L - 0.1055613458*a - 0.0638541728*b
    s_ = L - 0.0894841775*a - 1.2914855480*b
    l, m, s = l_**3, m_**3, s_**3
    r =  4.0767416621*l - 3.3077115913*m + 0.2309699292*s
    g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
    bb =  -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
    def enc(x):
        x = max(0.0, min(1.0, x))
        return 12.92*x if x <= 0.0031308 else 1.055*(x**(1/2.4)) - 0.055
    return enc(r), enc(g), enc(bb)

def rel_lum(rgb):
    def lin(c):
        return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
    r,g,b = (lin(c) for c in rgb)
    return 0.2126*r + 0.7152*g + 0.0722*b

def contrast(fg, bg):
    L1, L2 = rel_lum(fg), rel_lum(bg)
    hi, lo = max(L1,L2), min(L1,L2)
    return (hi+0.05)/(lo+0.05)

bg_panel = oklch_to_srgb(0.186, 0.010, 225)
bg_void  = oklch_to_srgb(0.145, 0.009, 225)
tokens = {
  'ink':       (0.955, 0.006, 210),
  'ink-dim':   (0.795, 0.010, 212),
  'ink-mute':  (0.645, 0.013, 215),
  'ink-faint': (0.492, 0.013, 218),
  'faint@0.60':(0.600, 0.013, 218),
  'faint@0.62':(0.620, 0.013, 218),
}
print(f"{'token':<12} {'on panel':>9} {'on void':>9}   verdict for 11px text (needs 4.5)")
for name,(L,C,H) in tokens.items():
    fg = oklch_to_srgb(L,C,H)
    cp, cv = contrast(fg,bg_panel), contrast(fg,bg_void)
    ok = 'PASS' if min(cp,cv) >= 4.5 else 'FAIL'
    print(f"{name:<12} {cp:>8.2f}: {cv:>8.2f}:   {ok}")
