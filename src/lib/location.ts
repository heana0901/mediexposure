export type LocationHint = {
  /** 광역 단위(예: "경기도", "서울") */
  region: string | null;
  /** 기초 단위(예: "고양시", "덕양구") */
  city: string | null;
};

const WIDE_REGIONS = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충청북도",
  "충북",
  "충청남도",
  "충남",
  "전라북도",
  "전북",
  "전라남도",
  "전남",
  "경상북도",
  "경북",
  "경상남도",
  "경남",
  "제주",
];

/**
 * 자유 텍스트 주소(예: "경기도 안산시 단원구 광덕대로 181")에서
 * 검색 위치 보정에 쓸 광역/기초 지역명을 뽑아낸다.
 */
export function extractLocationHint(region: string | null | undefined): LocationHint | null {
  if (!region) return null;
  const trimmed = region.trim();
  if (!trimmed) return null;

  // 주소 첫 토큰이 광역 단위면 "경기도"처럼 적힌 그대로 쓴다.
  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  const wide = WIDE_REGIONS.some((name) => firstToken.startsWith(name)) ? firstToken : null;
  const city = trimmed.match(/[가-힣]+시/)?.[0] ?? trimmed.match(/[가-힣]+구/)?.[0] ?? null;

  if (!wide && !city) return null;
  return { region: wide, city: city ?? wide };
}
