"use client";

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "@/lib/api";
import type {
  Client,
  ClientInput,
  Keyword,
  MonitoringResult,
  MonitoringRun,
  TrendPoint,
  UsageSummary,
  SelfExposure,
  CompetitorFrequencyEntry,
} from "@/lib/types";
import { Sidebar, type Tab } from "./Sidebar";
import { KeywordManager } from "./KeywordManager";
import { NewClientForm } from "./NewClientForm";
import { Modal } from "./Modal";
import { ExposureStatus } from "./ExposureStatus";
import { CompetitorAnalysis } from "./CompetitorAnalysis";
import { TrendChart } from "./TrendChart";
import { UsageDashboard } from "./UsageDashboard";
import { AccountManagement } from "./AccountManagement";
import { ReportPrintView } from "./ReportPrintView";

type ResultWithKeyword = MonitoringResult & { keywords: { text: string } };

const TAB_TITLE: Record<Tab, { title: string; subtitle: string }> = {
  status: { title: "AI 노출현황", subtitle: "클라이언트별 AI 검색 노출도를 모니터링합니다" },
  competitors: { title: "경쟁분석", subtitle: "미노출 항목과 경쟁사 언급 빈도를 분석합니다" },
  trends: { title: "추이 분석", subtitle: "모니터링 실행 기록에 따른 언급률 변화를 확인합니다" },
  usage: { title: "비용 현황", subtitle: "API 호출 횟수와 예상 비용을 확인합니다" },
  accounts: { title: "계정 관리", subtitle: "로그인 계정과 클라이언트 접근 권한을 관리합니다" },
};

export function Dashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [runs, setRuns] = useState<MonitoringRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [results, setResults] = useState<ResultWithKeyword[]>([]);
  const [tab, setTab] = useState<Tab>("status");
  const [isRunning, setIsRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientFormMode, setClientFormMode] = useState<"none" | "create" | "edit">("none");
  const [sendingReport, setSendingReport] = useState(false);
  const [reportMessage, setReportMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [competitorData, setCompetitorData] = useState<{
    unexposed: ResultWithKeyword[];
    competitorFrequency: CompetitorFrequencyEntry[];
    totalResults: number;
    selfExposure: SelfExposure;
  }>({
    unexposed: [],
    competitorFrequency: [],
    totalResults: 0,
    selfExposure: { count: 0, total: 0, chatgpt: { count: 0, total: 0 }, gemini: { count: 0, total: 0 } },
  });

  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [usage, setUsage] = useState<UsageSummary>({ totalRuns: 0, totalCostUsd: 0, byClient: [] });
  const [me, setMe] = useState<{ username: string; isAdmin: boolean } | null>(null);

  useEffect(() => {
    api.listClients().then(setClients).catch((e) => setError(e.message));
    api.getMe().then(setMe).catch(() => {});
  }, []);

  async function handleLogout() {
    await api.logout();
    window.location.href = "/login";
  }

  const [resetKey, setResetKey] = useState<string | null>(null);
  if (selectedClientId !== resetKey) {
    setResetKey(selectedClientId);
    setResults([]);
    setSelectedRunId(null);
  }

  useEffect(() => {
    if (!selectedClientId) return;

    api.listKeywords(selectedClientId).then(setKeywords).catch((e) => setError(e.message));
    api
      .listRuns(selectedClientId)
      .then((list) => {
        setRuns(list);
        if (list.length > 0) setSelectedRunId(list[0].id);
      })
      .catch((e) => setError(e.message));
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedRunId) return;
    api
      .getRun(selectedRunId)
      .then((data) => setResults(data.results))
      .catch((e) => setError(e.message));
  }, [selectedRunId]);

  useEffect(() => {
    if (tab !== "competitors" || !selectedClientId) return;
    api.getCompetitorAnalysis(selectedClientId).then(setCompetitorData).catch((e) => setError(e.message));
  }, [tab, selectedClientId]);

  useEffect(() => {
    if (tab !== "trends" || !selectedClientId) return;
    api.getTrends(selectedClientId).then(setTrends).catch((e) => setError(e.message));
  }, [tab, selectedClientId]);

  useEffect(() => {
    if (tab !== "usage") return;
    api.getUsage().then(setUsage).catch((e) => setError(e.message));
  }, [tab]);

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  async function handleCreateClient(input: ClientInput) {
    const client = await api.createClient(input);
    setClients((prev) => [...prev, client]);
    setSelectedClientId(client.id);
  }

  async function handleUpdateClient(input: ClientInput) {
    if (!selectedClientId) return;
    const updated = await api.updateClient(selectedClientId, input);
    setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function handleDeleteClient() {
    if (!selectedClient) return;
    const confirmed = window.confirm(
      `"${selectedClient.name}" 클라이언트를 삭제하시겠습니까?\n등록된 질문과 모니터링 기록이 모두 함께 삭제되며 되돌릴 수 없습니다.`
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await api.deleteClient(selectedClient.id);
      setClients((prev) => prev.filter((c) => c.id !== selectedClient.id));
      setSelectedClientId(null);
      setClientFormMode("none");
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddKeyword(text: string) {
    if (!selectedClientId) return;
    const keyword = await api.addKeyword(selectedClientId, text);
    setKeywords((prev) => [...prev, keyword]);
  }

  async function handleAddKeywordsBulk(texts: string[]) {
    if (!selectedClientId) return;
    const added = await api.addKeywordsBulk(selectedClientId, texts);
    setKeywords((prev) => [...prev, ...added]);
  }

  async function handleDeleteKeyword(id: string) {
    await api.deleteKeyword(id);
    setKeywords((prev) => prev.filter((k) => k.id !== id));
  }

  async function handleRunMonitoring() {
    if (!selectedClientId) return;
    setIsRunning(true);
    setError(null);
    try {
      const data = await api.runMonitoring(selectedClientId);
      const keywordMap = new Map(data.keywords.map((k) => [k.id, k]));
      const withKeyword = data.results.map((r) => ({
        ...r,
        keywords: { text: keywordMap.get(r.keyword_id)?.text ?? "" },
      }));
      setResults(withKeyword);
      setRuns((prev) => [data.run, ...prev]);
      setSelectedRunId(data.run.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  }

  async function handleSendReport() {
    if (!selectedClientId) return;
    setSendingReport(true);
    setReportMessage(null);
    try {
      const res = await api.sendReport(selectedClientId);
      setReportMessage({ type: "ok", text: `${res.sentTo}로 리포트를 발송했습니다.` });
    } catch (e) {
      setReportMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSendingReport(false);
    }
  }

  async function handleDownloadPdf() {
    if (!selectedClientId || !selectedClient) return;
    setDownloadingPdf(true);
    setReportMessage(null);

    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-99999px";
    host.style.top = "0";
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
      const data = await api.getReportData(selectedClientId);
      root.render(<ReportPrintView data={data} />);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(host.firstElementChild as HTMLElement, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = 210;
      const pageHeight = 297;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${selectedClient.name}_주간리포트.pdf`);
    } catch (e) {
      setReportMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      root.unmount();
      document.body.removeChild(host);
      setDownloadingPdf(false);
    }
  }

  const { title, subtitle } = TAB_TITLE[tab];

  return (
    <div className="flex flex-1 h-screen overflow-hidden bg-gray-50">
      <Sidebar
        clients={clients}
        selectedClientId={selectedClientId}
        onSelectClient={setSelectedClientId}
        onOpenCreateForm={() => setClientFormMode("create")}
        onOpenEditForm={() => setClientFormMode("edit")}
        onRunMonitoring={handleRunMonitoring}
        isRunning={isRunning}
        canRun={!!selectedClientId && keywords.length > 0}
        tab={tab}
        onTabChange={setTab}
        username={me?.username ?? null}
        isAdmin={me?.isAdmin ?? false}
        onLogout={handleLogout}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full p-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold">{title}</h1>
              <p className="text-sm text-gray-500">{subtitle}</p>
            </div>

            {selectedClientId && tab !== "usage" && tab !== "accounts" && (
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className="flex gap-2">
                  <button
                    className="text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
                    disabled={downloadingPdf}
                    onClick={handleDownloadPdf}
                  >
                    {downloadingPdf ? "생성 중..." : "📄 PDF 다운로드"}
                  </button>
                  <button
                    className="text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
                    disabled={sendingReport}
                    onClick={handleSendReport}
                  >
                    {sendingReport ? "발송 중..." : "📧 리포트 발송"}
                  </button>
                </div>
                {reportMessage && (
                  <span className={`text-xs ${reportMessage.type === "ok" ? "text-green-600" : "text-red-500"}`}>
                    {reportMessage.text}
                  </span>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {error}
            </div>
          )}

          {tab === "usage" ? (
            <UsageDashboard usage={usage} />
          ) : tab === "accounts" ? (
            <AccountManagement clients={clients} currentUsername={me?.username ?? null} />
          ) : !selectedClientId ? (
            <div className="border border-gray-100 rounded-xl bg-white shadow-sm flex flex-col items-center justify-center py-20 text-gray-400">
              <div className="font-medium text-gray-600">클라이언트를 선택해주세요</div>
              <div className="text-sm">왼쪽에서 클라이언트를 선택하거나 새로 추가하세요</div>
            </div>
          ) : (
            <>
              {tab === "status" && (
                <>
                  <KeywordManager
                    keywords={keywords}
                    onAddKeyword={handleAddKeyword}
                    onAddKeywordsBulk={handleAddKeywordsBulk}
                    onDeleteKeyword={handleDeleteKeyword}
                  />
                  <ExposureStatus
                    clientName={selectedClient?.name ?? ""}
                    clientType={selectedClient?.client_type ?? "hospital"}
                    results={results}
                    runs={runs}
                    selectedRunId={selectedRunId}
                    onSelectRun={setSelectedRunId}
                  />
                </>
              )}

              {tab === "competitors" && (
                <CompetitorAnalysis
                  clientName={selectedClient?.name ?? ""}
                  clientType={selectedClient?.client_type ?? "hospital"}
                  unexposed={competitorData.unexposed}
                  competitorFrequency={competitorData.competitorFrequency}
                  totalResults={competitorData.totalResults}
                  selfExposure={competitorData.selfExposure}
                />
              )}

              {tab === "trends" && <TrendChart data={trends} />}
            </>
          )}
        </div>
      </main>

      {clientFormMode === "create" && (
        <Modal onClose={() => setClientFormMode("none")}>
          <NewClientForm onSubmit={handleCreateClient} onClose={() => setClientFormMode("none")} />
        </Modal>
      )}

      {clientFormMode === "edit" && selectedClient && (
        <Modal onClose={() => setClientFormMode("none")}>
          <NewClientForm
            client={selectedClient}
            onSubmit={handleUpdateClient}
            onClose={() => setClientFormMode("none")}
            onDelete={handleDeleteClient}
            deleting={deleting}
            canDelete={me?.isAdmin ?? false}
          />
        </Modal>
      )}
    </div>
  );
}
