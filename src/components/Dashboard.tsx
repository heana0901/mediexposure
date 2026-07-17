"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Client, ClientInput, Keyword, MonitoringResult, MonitoringRun } from "@/lib/types";
import { ClientPanel } from "./ClientPanel";
import { ExposureStatus } from "./ExposureStatus";
import { CompetitorAnalysis } from "./CompetitorAnalysis";

type ResultWithKeyword = MonitoringResult & { keywords: { text: string } };

type Tab = "status" | "competitors";

export function Dashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [runs, setRuns] = useState<MonitoringRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [results, setResults] = useState<ResultWithKeyword[]>([]);
  const [tab, setTab] = useState<Tab>("status");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [competitorData, setCompetitorData] = useState<{
    unexposed: ResultWithKeyword[];
    competitorFrequency: { name: string; count: number }[];
    totalResults: number;
  }>({ unexposed: [], competitorFrequency: [], totalResults: 0 });

  useEffect(() => {
    api.listClients().then(setClients).catch((e) => setError(e.message));
  }, []);

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

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  async function handleCreateClient(input: ClientInput) {
    const client = await api.createClient(input);
    setClients((prev) => [...prev, client]);
    setSelectedClientId(client.id);
  }

  async function handleUpdateClient(id: string, input: ClientInput) {
    const updated = await api.updateClient(id, input);
    setClients((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }

  async function handleDeleteClient(id: string) {
    await api.deleteClient(id);
    setClients((prev) => prev.filter((c) => c.id !== id));
    if (selectedClientId === id) setSelectedClientId(null);
  }

  async function handleAddKeyword(text: string) {
    if (!selectedClientId) return;
    const keyword = await api.addKeyword(selectedClientId, text);
    setKeywords((prev) => [...prev, keyword]);
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

  return (
    <div className="max-w-5xl mx-auto w-full p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">AI 노출현황</h1>
        <p className="text-sm text-gray-500">클라이언트별 AI 검색 노출도를 모니터링합니다</p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      <ClientPanel
        clients={clients}
        selectedClientId={selectedClientId}
        onSelectClient={setSelectedClientId}
        onCreateClient={handleCreateClient}
        onUpdateClient={handleUpdateClient}
        onDeleteClient={handleDeleteClient}
        keywords={keywords}
        onAddKeyword={handleAddKeyword}
        onDeleteKeyword={handleDeleteKeyword}
        onRunMonitoring={handleRunMonitoring}
        isRunning={isRunning}
      />

      {selectedClientId && (
        <>
          <div className="flex gap-4 border-b mb-4 text-sm font-medium">
            <button
              className={`pb-2 -mb-px border-b-2 ${
                tab === "status" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400"
              }`}
              onClick={() => setTab("status")}
            >
              AI노출현황
            </button>
            <button
              className={`pb-2 -mb-px border-b-2 ${
                tab === "competitors" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400"
              }`}
              onClick={() => setTab("competitors")}
            >
              경쟁병원분석
            </button>
          </div>

          {tab === "status" ? (
            <ExposureStatus
              clientName={selectedClient?.name ?? ""}
              results={results}
              runs={runs}
              selectedRunId={selectedRunId}
              onSelectRun={setSelectedRunId}
            />
          ) : (
            <CompetitorAnalysis
              unexposed={competitorData.unexposed}
              competitorFrequency={competitorData.competitorFrequency}
              totalResults={competitorData.totalResults}
            />
          )}
        </>
      )}
    </div>
  );
}
