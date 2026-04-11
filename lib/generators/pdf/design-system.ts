export const DS = {
  colors: {
    // ── Semantic palette (use these in new code) ──
    primary:        [32, 59, 136]   as [number,number,number],
    accent:         [115, 184, 21]  as [number,number,number],
    danger:         [220, 38, 38]   as [number,number,number],
    warning:        [217, 119, 6]   as [number,number,number],
    success:        [22, 163, 74]   as [number,number,number],
    info:           [37, 99, 235]   as [number,number,number],

    // Text
    textPrimary:    [30, 30, 30]    as [number,number,number],
    textSecondary:  [55, 65, 81]    as [number,number,number],
    textMuted:      [156, 163, 175] as [number,number,number],
    textOnDark:     [180, 200, 240] as [number,number,number],

    // Surfaces
    pageBg:         [245, 248, 252] as [number,number,number],
    cardBg:         [255, 255, 255] as [number,number,number],
    surface:        [255, 255, 255] as [number,number,number],
    surface2:       [237, 242, 251] as [number,number,number],
    surface3:       [220, 232, 248] as [number,number,number],
    white:          [255, 255, 255] as [number,number,number],

    // Borders
    border:         [220, 225, 235] as [number,number,number],
    borderStrong:   [190, 195, 210] as [number,number,number],

    // Table
    tableHeaderBg:  [32, 59, 136]   as [number,number,number],
    tableHeaderText:[255, 255, 255] as [number,number,number],
    tableRowAlt:    [248, 250, 253] as [number,number,number],

    // Alert backgrounds & text
    dangerBg:       [254, 226, 226] as [number,number,number],
    dangerText:     [153, 27, 27]   as [number,number,number],
    dangerBorder:   [248, 180, 180] as [number,number,number],
    warningBg:      [254, 243, 199] as [number,number,number],
    warningText:    [133, 77, 14]   as [number,number,number],
    warningBorder:  [253, 211, 77]  as [number,number,number],
    successBg:      [220, 252, 231] as [number,number,number],
    successText:    [22, 101, 52]   as [number,number,number],
    infoBg:         [219, 234, 254] as [number,number,number],
    infoText:       [29, 78, 216]   as [number,number,number],

    // Header/Footer
    headerBg:       [30, 58, 95]    as [number,number,number],
    footerBg:       [22, 38, 68]    as [number,number,number],
    sectionTitleBg: [228, 238, 252] as [number,number,number],

    // Zebra rows
    zebraRow:       [248, 250, 252] as [number,number,number],

    // ── Legacy aliases (mapped to semantic values above) ──
    navy:            [32, 59, 136]  as [number,number,number],
    navyLight:       [26, 48, 112]  as [number,number,number],
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
    accentRGB:       [115, 184, 21] as [number,number,number],
    borderRGB:       [220, 225, 235] as [number,number,number],
    warn:            [217, 119, 6]  as [number,number,number],
    warnBg:          [254, 243, 199] as [number,number,number],
    warnText:        [133, 77, 14]  as [number,number,number],
    textLight2:      [156, 163, 175] as [number,number,number],
    textSec:         [55, 65, 81]   as [number,number,number],

    // Legacy alert aliases
    alertHighBg:    [254, 242, 242] as [number,number,number],
    alertHighBorder:[248, 180, 180] as [number,number,number],
    alertMedBg:     [255, 251, 235] as [number,number,number],
    alertMedBorder: [253, 211, 77]  as [number,number,number],

    // Legacy string
    _navyStr:        '#1E3A5F',
  },

  font: {
    // ── Scale (minimum 7pt for readability) ──
    hero:       24,
    h1:         14,
    h2:         11,
    h3:          9.5,
    body:        8.5,
    bodySmall:   8,
    caption:     7.5,
    micro:       7,

    // ── Semantic tokens ──
    tableHead:   8,
    tableCell:   8,
    chartLabel:  7.5,
    chartValue:  7,
    kpiValue:   12,
    kpiLabel:    7.5,
    kpiSub:      7,
    alertTitle:  8.5,
    alertBadge:  7,
    alertSub:    8,

    // ── Legacy aliases ──
    xs:   7,
    sm:   8,
    base: 9,
    md:   10,
    lg:   12,
    xl:   14,
    xxl:  18,
  },

  space: {
    pageMarginX:   14,
    pageMarginY:   16,
    sectionGap:    12,
    subsectionGap:  8,
    itemGap:        5,
    headerHeight:  12,
    footerHeight:   8,

    // Table
    tableRowH:      8,
    tableHeaderH:   8,
    tableCellPad:   2.5,

    // KPI cards
    kpiCardH:      24,
    kpiCardGap:     4,

    // Charts
    chartH:        55,
    chartLabelH:    8,
    chartPadTop:   12,

    // Alerts
    alertMinH:     12,
    alertLineH:     4.5,
    alertPillW:    20,

    // Info rows
    infoRowMinH:   20,

    // Page break
    pageBreakY:   270,

    // ── Legacy aliases ──
    xs:  2,
    sm:  4,
    md:  8,
    lg:  12,
    xl:  16,
    xxl: 24,
    kpiCardHeight: 24,
    kpiCardWidth:  42,
  },

  radius: {
    sm:   1,
    md:   1.5,
    lg:   2,
    xl:   3,
  },

  lineH: {
    tight:  4,
    normal: 5,
    loose:  6,
  },

  pageW:  210,
  pageH:  297,
} as const;
