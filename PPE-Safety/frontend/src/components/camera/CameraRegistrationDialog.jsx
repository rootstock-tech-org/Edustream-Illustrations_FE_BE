import { useEffect, useRef, useState } from "react";
import { Camera, Check, MapPin } from "lucide-react";

import Button from "../common/Button";
import { cameraRegistryApi } from "../../services/cameraRegistry";

/**
 * "New Camera Detected" — the registration dialog.
 *
 * Shown the first time a camera this deployment has never seen starts. Both
 * fields are mandatory; the backend refuses either blank, so the disabled
 * button here is a courtesy and not the enforcement. Cancel starts the
 * camera anyway, unregistered — a safety product must never make watching a
 * laser bay conditional on paperwork — and the same camera will simply be
 * asked about again another day.
 *
 * @param {object} props
 * @param {{cameraId: string, label?: string, kind: string}} props.camera
 *   the detected device: its stable identifier, its human label when the
 *   platform offers one, and which kind of source it is.
 * @param {(registration: object) => void} props.onRegistered
 * @param {() => void} props.onSkip
 */
export default function CameraRegistrationDialog({ camera, onRegistered, onSkip }) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const valid = name.trim().length > 0 && location.trim().length > 0;

  const submit = async () => {
    if (!valid || saving) return;

    setSaving(true);
    setError(null);

    try {
      const registration = await cameraRegistryApi.register({
        cameraId: camera.cameraId,
        cameraName: name.trim(),
        location: location.trim(),
        source: { kind: camera.kind, label: camera.label || null },
      });

      // The tick is worth a beat on screen; the camera starts right after.
      setDone(true);
      setTimeout(() => onRegistered(registration), 650);
    } catch (err) {
      setSaving(false);
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Could not register the camera.",
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4
                 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="New camera detected"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface border border-border
                   shadow-xl p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl bg-primary-soft text-primary
                       flex items-center justify-center shrink-0"
          >
            <Camera size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text">
              New camera detected
            </h2>
            <p className="text-sm text-text-secondary">
              Give it a name and a place, and every alert it raises will carry
              them.
            </p>
            {camera.label && (
              <p className="text-xs text-text-muted mt-1 truncate">
                Device: {camera.label}
              </p>
            )}
          </div>
        </div>

        {done ? (
          <div
            className="flex items-center gap-2 text-success text-sm font-medium
                       bg-success-soft border border-success/20 rounded-lg px-3 py-3"
          >
            <Check size={16} />
            Camera registered successfully.
          </div>
        ) : (
          <>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Camera name
              </span>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                maxLength={60}
                placeholder="Weldbay-1"
                disabled={saving}
                className="w-full text-sm text-text bg-subtle border border-border
                           rounded-lg px-3 py-2
                           focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Location
              </span>
              <div className="relative">
                <MapPin
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  maxLength={60}
                  placeholder="Laser Area"
                  disabled={saving}
                  className="w-full text-sm text-text bg-subtle border border-border
                             rounded-lg pl-8 pr-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </label>

            {error && (
              <p
                className="text-xs text-danger bg-danger-soft border border-danger/20
                           rounded-lg px-3 py-2"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={onSkip} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={submit}
                disabled={!valid}
                loading={saving}
              >
                {saving ? "Registering…" : "Register camera"}
              </Button>
            </div>

            <p className="text-xs text-text-muted">
              Cancel starts the camera without registering it — its alerts
              will not carry a name or place until it is registered.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
