export const DS = {
  colors: {
    // Primárias (navy refinado)
    primary:        [12, 27, 58]    as [number,number,number],  // navy900 — headers
    accent:         [115, 184, 21]  as [number,number,number],  // verde marca
    danger:         [197, 48, 48]   as [number,number,number],  // red600
    warning:        [212, 149, 10]  as [number,number,number],  // amber500
    success:        [22, 101, 58]   as [number,number,number],  // green600
    pageBg:         [249, 250, 251] as [number,number,number],  // gray50
    cardBg:         [255, 255, 255] as [number,number,number],
    textPrimary:    [17, 24, 39]    as [number,number,number],  // gray900
    textSecondary:  [55, 65, 81]    as [number,number,number],  // gray700
    textMuted:      [156, 163, 175] as [number,number,number],  // gray400
    border:         [229, 231, 235] as [number,number,number],  // gray200
    borderStrong:   [209, 213, 219] as [number,number,number],  // gray300
    tableHeaderBg:  [12, 27, 58]    as [number,number,number],  // navy900
    tableHeaderText:[255, 255, 255] as [number,number,number],
    tableRowAlt:    [249, 250, 251] as [number,number,number],  // gray50
    alertHighBg:    [254, 242, 242] as [number,number,number],  // red50
    alertHighBorder:[254, 226, 226] as [number,number,number],  // red100
    alertMedBg:     [254, 249, 236] as [number,number,number],  // amber50
    alertMedBorder: [253, 243, 215] as [number,number,number],  // amber100
    white:          [255, 255, 255] as [number,number,number],
    // Legacy aliases used by helpers (mapped to above or extra)
    navy:            [12, 27, 58]   as [number,number,number],  // navy900
    navyLight:       [19, 41, 82]   as [number,number,number],  // navy800
    green:           [22, 163, 74]  as [number,number,number],
    greenBg:         [220, 252, 231] as [number,number,number],
    red:             [220, 38, 38]  as [number,number,number],
    redBg:           [254, 226, 226] as [number,number,number],
    orange:          [217, 119, 6]  as [number,number,number],
    orangeBg:        [254, 243, 199] as [number,number,number],
    purple:          [124, 58, 237] as [number,number,number],
    purpleBg:        [237, 233, 254] as [number,number,number],
    gray:            [107, 114, 128] as [number,number,number],
    grayBg:          [241, 245, 249] as [number,number,number],
    grayLight:       [248, 250, 252] as [number,number,number],
    text:            [17, 24, 39]   as [number,number,number],
    textLight:       [107, 114, 128] as [number,number,number],
    // RGB aliases for legacy spread usage
    headerBg:        [12, 27, 58]   as [number,number,number],  // navy900
    accentRGB:       [115, 184, 21] as [number,number,number],
    zebraRow:        [249, 250, 251] as [number,number,number],
    borderRGB:       [220, 225, 235] as [number,number,number],
    dangerBg:        [254, 226, 226] as [number,number,number],
    dangerText:      [153, 27, 27]  as [number,number,number],
    warn:            [217, 119, 6]  as [number,number,number],
    warnBg:          [254, 243, 199] as [number,number,number],
    warnText:        [133, 77, 14]  as [number,number,number],
    info:            [37, 99, 235]  as [number,number,number],
    infoBg:          [219, 234, 254] as [number,number,number],
    infoText:        [29, 78, 216]  as [number,number,number],
    successBg:       [220, 252, 231] as [number,number,number],
    successText:     [22, 101, 52]  as [number,number,number],
    textLight2:      [156, 163, 175] as [number,number,number],
    surface:         [255, 255, 255] as [number,number,number],
    surface2:        [237, 242, 251] as [number,number,number],
    surface3:        [220, 232, 248] as [number,number,number],
    textSec:         [55, 65, 81]   as [number,number,number],
    // Legacy string colors (used by old DS object in pdf.ts)
    _navyStr:        '#1E3A5F',
  },
  font: {
    hero:  22,
    h1:    14,
    h2:    11,
    body:   9,
    small:  8,
    micro:  7,
    // Legacy aliases
    xs:   7,
    sm:   8,
    base: 9,
    md:   10,
    lg:   12,
    xl:   14,
    xxl:  18,
  },
  space: {
    pageMarginX:   18,
    pageMarginY:   22,
    sectionGap:    10,
    itemGap:        5,
    headerHeight:  12,
    footerHeight:   8,
    kpiCardHeight: 22,
    kpiCardWidth:  42,
    // Legacy aliases
    xs:  2,
    sm:  4,
    md:  8,
    lg:  12,
    xl:  16,
    xxl: 24,
  },
  radius: 1.5,
  lineH:  5.5,
  pageW:  210,
  pageH:  297,
} as const;
