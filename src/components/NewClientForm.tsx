"use client";

import { useState } from "react";
import type { Client, ClientInput, ClientType } from "@/lib/types";

type Props = {
  client?: Client;
  onSubmit: (input: ClientInput) => Promise<void>;
  onClose: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  canDelete?: boolean;
};

function toSpecialistOption(value: boolean | null | undefined): "unknown" | "yes" | "no" {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

const TYPE_LABELS: Record<ClientType, { name: string; namePlaceholder: string; department: string; departmentPlaceholder: string; director: string; directorPlaceholder: string }> = {
  hospital: {
    name: "병원명 *",
    namePlaceholder: "예: 서울항외과",
    department: "진료과목",
    departmentPlaceholder: "예: 대장항문외과",
    director: "대표원장",
    directorPlaceholder: "예: 홍길동",
  },
  business: {
    name: "업체명 *",
    namePlaceholder: "예: 무신사 스토어",
    department: "업종/카테고리",
    departmentPlaceholder: "예: 여성의류 쇼핑몰",
    director: "대표자명",
    directorPlaceholder: "예: 홍길동",
  },
};

export function NewClientForm({ client, onSubmit, onClose, onDelete, deleting, canDelete }: Props) {
  const isEdit = !!client;
  const [clientType, setClientType] = useState<ClientType>(client?.client_type ?? "hospital");
  const [name, setName] = useState(client?.name ?? "");
  const [region, setRegion] = useState(client?.region ?? "");
  const [department, setDepartment] = useState(client?.department ?? "");
  const [directorName, setDirectorName] = useState(client?.director_name ?? "");
  const [isSpecialist, setIsSpecialist] = useState<"unknown" | "yes" | "no">(
    toSpecialistOption(client?.is_specialist)
  );
  const [contactEmail, setContactEmail] = useState(client?.contact_email ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(client?.website_url ?? "");
  const [saving, setSaving] = useState(false);

  const labels = TYPE_LABELS[clientType];

  async function handleSubmit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        client_type: clientType,
        region: region.trim() || undefined,
        department: department.trim() || undefined,
        director_name: directorName.trim() || undefined,
        is_specialist: clientType === "hospital" ? (isSpecialist === "unknown" ? null : isSpecialist === "yes") : null,
        contact_email: contactEmail.trim() || undefined,
        website_url: websiteUrl.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full border border-gray-100 rounded-xl bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          {isEdit ? "클라이언트 정보 수정" : "새 클라이언트 추가"}
        </span>
        <button className="text-gray-400 hover:text-gray-600 text-sm" onClick={onClose}>
          닫기
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs text-gray-500">
        업종 유형
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
          value={clientType}
          onChange={(e) => setClientType(e.target.value as ClientType)}
        >
          <option value="hospital">병원</option>
          <option value="business">일반 사업자 (쇼핑몰 등)</option>
        </select>
      </label>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          {labels.name}
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={labels.namePlaceholder}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-500">
          지역
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="예: 서울 강남구"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-500">
          {labels.department}
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder={labels.departmentPlaceholder}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-500">
          {labels.director}
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
            value={directorName}
            onChange={(e) => setDirectorName(e.target.value)}
            placeholder={labels.directorPlaceholder}
          />
        </label>

        {clientType === "hospital" && (
          <label className="flex flex-col gap-1 text-xs text-gray-500 sm:col-span-2">
            전문의 여부
            <select
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
              value={isSpecialist}
              onChange={(e) => setIsSpecialist(e.target.value as "unknown" | "yes" | "no")}
            >
              <option value="unknown">선택 안 함</option>
              <option value="yes">전문의</option>
              <option value="no">전문의 아님</option>
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs text-gray-500 sm:col-span-2">
          리포트 수신 이메일 (담당자)
          <input
            type="email"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="예: manager@example.com"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-500 sm:col-span-2">
          홈페이지 URL (홈페이지 분석에서 재사용)
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="예: https://mystore.com"
          />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <button
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
          disabled={!name.trim() || saving}
          onClick={handleSubmit}
        >
          {saving ? "저장 중..." : isEdit ? "저장" : "추가"}
        </button>

        {isEdit && canDelete && onDelete && (
          <button
            className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50"
            disabled={deleting}
            onClick={onDelete}
          >
            {deleting ? "삭제 중..." : "클라이언트 삭제"}
          </button>
        )}
      </div>
    </div>
  );
}
