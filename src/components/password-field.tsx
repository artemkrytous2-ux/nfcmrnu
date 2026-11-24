"use client";

import { useState } from "react";
import { authFieldClass } from "@/components/auth-frame";

export function PasswordField({
  id,
  label,
  value,
  autoComplete,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="grid gap-2 text-[15px]" htmlFor={id}>
      <span className="text-muted">{label}</span>
      <span className="relative block">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${authFieldClass} pr-24`}
          style={{ fontSize: "16px" }}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-muted"
          aria-pressed={visible}
        >
          {visible ? "Скрыть" : "Показать"}
        </button>
      </span>
    </label>
  );
}
