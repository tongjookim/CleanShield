export const KEYWORD_PLATFORMS = [
  { id: "x", label: "X (트위터)" },
  { id: "facebook", label: "페이스북" },
  { id: "instagram", label: "인스타그램" },
  { id: "threads", label: "스레드" },
  { id: "youtube", label: "유튜브" },
  { id: "reddit", label: "레딧" },
  { id: "naver", label: "네이버" },
  { id: "daum", label: "다음" },
  { id: "dcinside", label: "디시인사이드" },
  { id: "clien", label: "클리앙" },
  { id: "ruliweb", label: "루리웹" },
  { id: "theqoo", label: "더쿠" },
  { id: "instiz", label: "인스티즈" },
  { id: "fmkorea", label: "에펨코리아" },
  { id: "dogdrip", label: "개드립" },
  { id: "todayhumor", label: "오늘의유머" },
  { id: "ppomppu", label: "뽐뿌" },
  { id: "arca", label: "아카라이브" },
  { id: "bobaedream", label: "보배드림" },
  { id: "pann", label: "네이트판" },
];

export function platformLabel(id) {
  return KEYWORD_PLATFORMS.find((platform) => platform.id === id)?.label || id;
}
