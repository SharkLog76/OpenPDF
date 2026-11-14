/**
 * PowerPoint (.pptx) OOXML Exporter Provider backed by `fflate`.
 * Generates valid ECMA-376 PresentationML decks matching PDF page aspect ratios in EMU
 * (1 PDF pt = 12700 EMU).
 *
 * Supports three modes:
 * - 'exact-slides' (default): High-fidelity slide backdrop (HD image) + overlaid editable text boxes with exact typography.
 * - 'editable-text': Clean editable text shapes only without background imagery.
 * - 'visual-slides': High-resolution raster slides with full presenter notes transcript.
 */
import { strToU8, zipSync } from 'fflate';
import {
  analyzeExtractedPage,
  escapeXml,
  extractPageLayoutBoxes,
  sanitizeXmlText,
  type PdfPageExtractedContent,
  type PptxExportMode,
  type StructuredPageAnalysis,
} from '../../domain/converter.ts';

const EMU_PER_PT = 12700;

function ptToEmu(pt: number): number {
  return Math.max(91440, Math.round(pt * EMU_PER_PT));
}

function cleanColorHex(colorHex?: string): string {
  if (!colorHex) return '0F172A';
  const clean = colorHex.replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return clean.toUpperCase();
  }
  return '0F172A';
}

function resolvePptxFont(family?: string): string {
  if (!family) return 'Arial';
  const lower = family.toLowerCase();
  if (lower.includes('times') || lower.includes('serif')) return 'Times New Roman';
  if (lower.includes('courier') || lower.includes('mono')) return 'Courier New';
  return 'Arial';
}

function buildThemeXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="OpenPDF Theme">' +
    '<a:themeElements>' +
    '<a:clrScheme name="OpenPDF">' +
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
    '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="1E293B"/></a:dk2>' +
    '<a:lt2><a:srgbClr val="F1F5F9"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="2563EB"/></a:accent1>' +
    '<a:accent2><a:srgbClr val="0EA5E9"/></a:accent2>' +
    '<a:accent3><a:srgbClr val="10B981"/></a:accent3>' +
    '<a:accent4><a:srgbClr val="F59E0B"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="6366F1"/></a:accent5>' +
    '<a:accent6><a:srgbClr val="EC4899"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="2563EB"/></a:hlink>' +
    '<a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>' +
    '</a:clrScheme>' +
    '<a:fontScheme name="OpenPDF">' +
    '<a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
    '</a:fontScheme>' +
    '<a:fmtScheme name="OpenPDF">' +
    '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
    '<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
    '</a:fmtScheme>' +
    '</a:themeElements>' +
    '</a:theme>'
  );
}

function buildSlideMasterXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    '<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>' +
    '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>' +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    '</p:sldMaster>'
  );
}

function buildSlideLayoutXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">' +
    '<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>' +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' +
    '</p:sldLayout>'
  );
}

function buildPictureShapeXml(
  shapeId: number,
  relId: string,
  widthEmu: number,
  heightEmu: number,
  name: string
): string {
  return (
    '<p:pic>' +
    `<p:nvPicPr><p:cNvPr id="${shapeId}" name="${escapeXml(name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    '</p:pic>'
  );
}

function buildTextBoxXml(
  shapeId: number,
  xEmu: number,
  yEmu: number,
  cxEmu: number,
  cyEmu: number,
  text: string,
  fontSizePt: number,
  fontFamily: string,
  colorHex: string,
  bold: boolean,
  italic: boolean
): string {
  const sz = Math.min(9600, Math.max(700, Math.round(fontSizePt * 100)));
  const boldAttr = bold ? ' b="1"' : '';
  const italicAttr = italic ? ' i="1"' : '';
  const fontName = resolvePptxFont(fontFamily);
  const color = cleanColorHex(colorHex);

  const lines = text.split('\n');
  const paragraphs = lines
    .map(
      (l) =>
        `<a:p><a:r><a:rPr lang="fr-FR" sz="${sz}"${boldAttr}${italicAttr}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${escapeXml(fontName)}"/></a:rPr><a:t>${escapeXml(l)}</a:t></a:r></a:p>`
    )
    .join('');

  return (
    '<p:sp>' +
    `<p:nvSpPr><p:cNvPr id="${shapeId}" name="TextBox ${shapeId}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${xEmu}" y="${yEmu}"/><a:ext cx="${cxEmu}" cy="${cyEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/>' +
    paragraphs +
    '</p:txBody></p:sp>'
  );
}

function buildNotesSlideXml(notesText: string): string {
  const safe = sanitizeXmlText(notesText).trim() || 'Diapositive exportée par OpenPDF.';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>' +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR"/><a:t>${escapeXml(safe)}</a:t></a:r></a:p></p:txBody>` +
    '</p:sp></p:spTree></p:cSld></p:notes>'
  );
}

export function exportPagesToPptx(
  pages: readonly PdfPageExtractedContent[],
  mode: PptxExportMode = 'exact-slides'
): { readonly bytes: Uint8Array; readonly analyses: StructuredPageAnalysis[] } {
  const analyses = pages.map((p) => analyzeExtractedPage(p));
  const slideW = Math.round((pages[0]?.widthPt ?? 595.28) * EMU_PER_PT);
  const slideH = Math.round((pages[0]?.heightPt ?? 841.89) * EMU_PER_PT);

  const files: Record<string, Uint8Array> = {
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
        '</Relationships>'
    ),
    'ppt/theme/theme1.xml': strToU8(buildThemeXml()),
    'ppt/slideMasters/slideMaster1.xml': strToU8(buildSlideMasterXml()),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
        '</Relationships>'
    ),
    'ppt/slideLayouts/slideLayout1.xml': strToU8(buildSlideLayoutXml()),
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
        '</Relationships>'
    ),
    'ppt/presProps.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presProps xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>'
    ),
    'ppt/viewProps.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:viewProps xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>'
    ),
    'ppt/tableStyles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>'
    ),
  };

  const contentTypeOverrides: string[] = [
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>',
    '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>',
    '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>',
  ];

  const presentationSlideList: string[] = [];
  const presentationRels: string[] = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>',
    '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>',
    '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>',
  ];

  let hasAnyPngMedia = false;

  for (let i = 0; i < pages.length; i++) {
    const slideNum = i + 1;
    const relOffset = 6 + i;
    const src = pages[i];
    const analysis = analyses[i];

    const shapes: string[] = [];
    const slideRels: string[] = [
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${slideNum}.xml"/>`,
    ];

    let shapeId = 2;
    const includeBackdrop = (mode === 'exact-slides' || mode === 'visual-slides' || !analysis.hasText) && Boolean(src.rasterPngBytes);

    if (includeBackdrop && src.rasterPngBytes) {
      hasAnyPngMedia = true;
      files[`ppt/media/image${slideNum}.png`] = src.rasterPngBytes;
      slideRels.push(
        `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${slideNum}.png"/>`
      );
      shapes.push(
        buildPictureShapeXml(
          shapeId++,
          'rId3',
          slideW,
          slideH,
          `PDF Page ${src.pageIndex + 1}`
        )
      );
    }

    const includeText = mode === 'exact-slides' || mode === 'editable-text';
    if (includeText) {
      const scaleX = slideW / Math.max(1, src.widthPt);
      const scaleY = slideH / Math.max(1, src.heightPt);
      const boxes = extractPageLayoutBoxes(src);

      if (boxes.length > 0) {
        for (const box of boxes) {
          const textClean = sanitizeXmlText(box.text);
          if (!textClean.trim()) continue;

          const xEmu = Math.max(0, Math.round(box.leftPt * scaleX));
          const yEmu = Math.max(0, Math.round(box.topPt * scaleY));
          const cxEmu = Math.min(slideW - xEmu, Math.max(91440, Math.round(box.widthPt * scaleX)));
          const cyEmu = Math.min(slideH - yEmu, Math.max(91440, Math.round(box.heightPt * scaleY)));

          shapes.push(
            buildTextBoxXml(
              shapeId++,
              xEmu,
              yEmu,
              cxEmu,
              cyEmu,
              textClean,
              box.fontSizePt,
              box.fontFamily,
              box.colorHex ?? '0F172A',
              box.bold,
              box.italic
            )
          );
        }
      } else if (analysis.hasText) {
        for (const line of analysis.lines) {
          const textClean = sanitizeXmlText(line.text);
          if (!textClean.trim()) continue;

          const xEmu = Math.max(0, Math.round(line.leftPt * scaleX));
          const yEmu = Math.max(0, Math.round(line.topPt * scaleY));
          const cxEmu = Math.min(slideW - xEmu, Math.max(91440, Math.round(line.widthPt * scaleX)));
          const cyEmu = Math.min(slideH - yEmu, Math.max(91440, Math.round(line.heightPt * scaleY)));

          shapes.push(
            buildTextBoxXml(
              shapeId++,
              xEmu,
              yEmu,
              cxEmu,
              cyEmu,
              textClean,
              line.fontSizePt,
              line.fontFamily,
              line.colorHex ?? '0F172A',
              line.bold,
              line.italic
            )
          );
        }
      } else if (!includeBackdrop) {
        shapes.push(
          buildTextBoxXml(
            shapeId++,
            ptToEmu(40),
            ptToEmu(60),
            ptToEmu(450),
            ptToEmu(40),
            `Page ${src.pageIndex + 1} : aucun texte extractible`,
            14,
            'Arial',
            '64748B',
            false,
            true
          )
        );
      }
    }

    files[`ppt/slides/slide${slideNum}.xml`] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
        shapes.join('') +
        '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
    );

    files[`ppt/slides/_rels/slide${slideNum}.xml.rels`] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slideRels.join('')}</Relationships>`
    );

    files[`ppt/notesSlides/notesSlide${slideNum}.xml`] = strToU8(buildNotesSlideXml(analysis.rawText));
    files[`ppt/notesSlides/_rels/notesSlide${slideNum}.xml.rels`] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${slideNum}.xml"/>` +
        '</Relationships>'
    );

    contentTypeOverrides.push(
      `<Override PartName="/ppt/slides/slide${slideNum}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
      `<Override PartName="/ppt/notesSlides/notesSlide${slideNum}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
    );

    presentationSlideList.push(`<p:sldId id="${256 + i}" r:id="rId${relOffset}"/>`);
    presentationRels.push(
      `<Relationship Id="rId${relOffset}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slideNum}.xml"/>`
    );
  }

  files['ppt/presentation.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      `<p:sldIdLst>${presentationSlideList.join('')}</p:sldIdLst>` +
      `<p:sldSz cx="${slideW}" cy="${slideH}"/>` +
      `<p:notesSz cx="${slideH}" cy="${slideW}"/>` +
      '</p:presentation>'
  );

  files['ppt/_rels/presentation.xml.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presentationRels.join('')}</Relationships>`
  );

  const pngDefault = hasAnyPngMedia ? '<Default Extension="png" ContentType="image/png"/>' : '';
  files['[Content_Types].xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      pngDefault +
      contentTypeOverrides.join('') +
      '</Types>'
  );

  return { bytes: zipSync(files, { level: 6 }), analyses };
}
