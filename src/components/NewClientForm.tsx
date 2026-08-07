"use client";

import { useState } from "react";
import type { Client, ClientInput } from "@/lib/types";

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

export function NewClientForm({ client, onSubmit, onClose, onDelete, deleting, canDelete }: Props) {
  const isEdit = !!client;
  const [name, setName] = useState(client?.name ?? "");
  const [region, setRegion] = useState(client?.region ?? "");
  const [department, setDepartment] = useState(client?.department ?? "");
  const [directorName, setDirectorName] = useState(client?.director_name ?? "");
  const [isSpecialist, setIsSpecialist] = useState<"unknown" | "yes" | "no">(
    toSpecialistOption(client?.is_specialist)
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        region: region.trim() || undefined,
        department: department.trim() || undefined,
        director_name: directorName.trim() || undefined,
        is_specialist: isSpecialist === "unknown" ? null : isSpecialist === "yes",
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full border rounded-xl bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          {isEdit ? "클라이언트 정보 수정" : "새 클라이언트 추가"}
        </span>
        <button className="text-gray-400 hover:text-gray-600 text-sm" onClick={onClose}>
          닫기
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          병원명 *
          <input
            className="border rounded-lg px-3 py-2 text-sm text-gray-900"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 서울항외과"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-500">
          지역
          <input
            className="border rounded-lg px-3 py-2 text-sm text-gray-900"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="예: 서울 강남구"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-500">
          진료과목
          <input
            className="border rounded-lg px-3 py-2 text-sm text-gray-900"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="예: 대장항문외과"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-500">
          대표원장
          <input
            className="border rounded-lg px-3 py-2 text-sm text-gray-900"
            value={directorName}
            onChange={(e) => setDirectorName(e.target.value)}
            placeholder="예: 홍길동"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-500 sm:col-span-2">
          전문의 여부
          <select
            className="border rounded-lg px-3 py-2 text-sm text-gray-900"
            value={isSpecialist}
            onChange={(e) => setIsSpecialist(e.target.value as "unknown" | "yes" | "no")}
          >
            <option value="unknown">선택 안 함</option>
            <option value="yes">전문의</option>
            <option value="no">전문의 아님</option>
          </select>
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
