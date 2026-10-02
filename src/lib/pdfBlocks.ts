/**
 * 화면 밖에 그린 리포트를 A4 PDF로 저장한다 (브라우저 전용).
 * data-pdf-block이 붙은 요소를 하나씩 그려 붙여서, 페이지가 블록 중간에서 잘리지 않게 한다.
 * 한 페이지보다 긴 블록만 페이지 높이로 잘라 이어 붙인다.
 */
export async function saveBlocksAsPdf(host: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 10;
  const contentW = PAGE_W - MARGIN * 2;
  const usableH = PAGE_H - MARGIN * 2;
  let y = MARGIN;

  const blocks = Array.from(host.querySelectorAll<HTMLElement>("[data-pdf-block]"));
  for (const block of blocks) {
    const canvas = await html2canvas(block, { scale: 2, backgroundColor: "#ffffff" });
    const mmPerPx = contentW / canvas.width;
    const blockH = canvas.height * mmPerPx;

    if (blockH <= usableH) {
      if (y + blockH > PAGE_H - MARGIN) {
        pdf.addPage();
        y = MARGIN;
      }
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.85), "JPEG", MARGIN, y, contentW, blockH);
      y += blockH;
      continue;
    }

    const sliceH = Math.floor(usableH / mmPerPx);
    for (let offset = 0; offset < canvas.height; offset += sliceH) {
      const part = document.createElement("canvas");
      part.width = canvas.width;
      part.height = Math.min(sliceH, canvas.height - offset);
      part.getContext("2d")!.drawImage(canvas, 0, offset, canvas.width, part.height, 0, 0, canvas.width, part.height);
      if (y > MARGIN) {
        pdf.addPage();
        y = MARGIN;
      }
      const partH = part.height * mmPerPx;
      pdf.addImage(part.toDataURL("image/jpeg", 0.85), "JPEG", MARGIN, y, contentW, partH);
      y += partH;
    }
  }

  pdf.save(filename);
}
