'use client';

import { ReactNode, useEffect } from 'react';

/**
 * Las piezas de interfaz que comparten los dos editores del hub.
 *
 * Vienen del prototipo de la misión B (que las tenía con otro nombre y otro
 * lenguaje visual) y aquí ya están con las clases del Content Hub: negro de
 * fondo, blanco de tinta, fucsia de marca y mostaza para lo que está activo.
 *
 * Lo que NO cambia al portarlas: el comportamiento. Los controles del editor de
 * foto y de video se manejan igual que se manejaban allá, para que lo que se
 * aprendió probando el prototipo siga siendo cierto.
 */

export function Panel({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="est-panel">
      {title ? (
        <header className="est-panel-title">
          {title}
          {actions ? <span className="ml-auto flex gap-1">{actions}</span> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="est-field">
      <span className="est-field-label">
        {label}
        <b>
          {Math.round(value * 100) / 100}
          {unit}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="est-switch">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { id: T; name: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="est-chip-row" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="est-chip"
          data-active={value === o.id}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="est-field">
      <span className="est-field-label">{label}</span>
      {children}
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="est-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="est-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {subtitle ? <p className="est-muted mt-0">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  );
}
