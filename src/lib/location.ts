/** 자유 텍스트 주소(예: "경기도 안산시 단원구 광덕대로 181")에서 검색 위치 보정에 쓸 도시명을 뽑아낸다. */
export function extractCityFromRegion(region: string | null | undefined): string | null {
  if (!region) return null;
  const trimmed = region.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("서울")) return "서울";

  const cityMatch = trimmed.match(/[가-힣]+시/);
  if (cityMatch) return cityMatch[0];

  const guMatch = trimmed.match(/[가-힣]+구/);
  if (guMatch) return guMatch[0];

  return null;
}
