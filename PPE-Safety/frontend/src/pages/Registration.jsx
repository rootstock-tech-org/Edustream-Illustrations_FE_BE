import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import Badge from "../components/common/Badge";
import Button from "../components/common/Button";
import Panel from "../components/common/Panel";
import { EmptyState, ErrorState } from "../components/common/States";
import { WorkerAvatar } from "../components/training/WorkerBadges";
import { workersApi } from "../services/workers";

/**
 * Worker registration.
 *
 * HR fills the form once; the answer is a link, and the link is the
 * deliverable — it is handed to the worker, and everything after
 * (training, certificate, assessment) happens on the worker's own phone
 * at that address. The link is shown large at the moment of registration
 * and kept recoverable in the list below, because a link that can only be
 * copied in the first five seconds is a link that gets lost.
 */

const POLL_MS = 5000;

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  employee_id: "",
  designation: "",
  department: "",
  phone: "",
  dob: "",
  date_of_joining: "",
  blood_group: "",
  emergency_name: "",
  emergency_phone: "",
};

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

//: The face module's enrollment limits, mirrored: the photos become the
//: worker's recognition, so the same 1-5 applies here.
const MIN_PHOTOS = 1;
const MAX_PHOTOS = 5;

const INPUT_CLASS =
  "w-full text-sm text-text bg-subtle border border-border rounded-lg " +
  "px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40";

/** A labelled field in the register form. */
function Field({ label, required = false, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}

/** The worker's training status, in one chip. */
function StatusBadge({ worker }) {
  if (worker.assessment) {
    const { score, total, passed } = worker.assessment;
    return (
      <Badge variant={passed ? "success" : "danger"} dot={false}>
        Assessment {score}/{total} {passed ? "passed" : "failed"}
      </Badge>
    );
  }
  if (worker.training) {
    return (
      <Badge variant="primary" dot={false}>
        Certified
      </Badge>
    );
  }
  return (
    <Badge variant="neutral" dot={false}>
      Training pending
    </Badge>
  );
}

/** Copy a worker's full link; flashes a check when it lands. */
function CopyLinkButton({ linkPath }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const link = `${window.location.origin}${linkPath}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard can be refused (http, permissions). Fall back to the
      // oldest trick that still works everywhere.
      const helper = document.createElement("textarea");
      helper.value = link;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      icon={copied ? Check : Copy}
      onClick={copy}
    >
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

export default function Registration() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // The photos to register with: [{file, url}]. Previews are object URLs,
  // revoked when a photo is removed or the form is cleared.
  const [photos, setPhotos] = useState([]);

  // The most recent registration, kept apart from the list: its link is
  // the moment this page exists for, and it deserves the top of the page.
  const [registered, setRegistered] = useState(null);

  const [workers, setWorkers] = useState(null);
  const [error, setError] = useState(null);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await workersApi.list();
      if (!mounted.current) return;
      setWorkers(data.workers);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err?.message || "Could not reach the AI system.");
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const addPhotos = (e) => {
    const chosen = Array.from(e.target.files || []);
    e.target.value = "";
    setPhotos((old) => {
      const room = MAX_PHOTOS - old.length;
      const kept = chosen.slice(0, Math.max(0, room)).map((file) => ({
        file,
        url: URL.createObjectURL(file),
      }));
      return [...old, ...kept];
    });
  };

  const removePhoto = (index) => {
    setPhotos((old) => {
      URL.revokeObjectURL(old[index]?.url);
      return old.filter((_, i) => i !== index);
    });
  };

  const clearPhotos = () => {
    setPhotos((old) => {
      old.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
  };

  const valid =
    form.first_name.trim() &&
    form.last_name.trim() &&
    form.employee_id.trim() &&
    form.designation.trim() &&
    photos.length >= MIN_PHOTOS &&
    photos.length <= MAX_PHOTOS;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const worker = await workersApi.register(
        form,
        photos.map((p) => p.file),
      );
      if (!mounted.current) return;
      setRegistered(worker);
      setForm(EMPTY_FORM);
      clearPhotos();
      await refresh();
    } catch (err) {
      if (!mounted.current) return;
      setFormError(
        err?.response?.data?.detail || err?.message || "Could not register.",
      );
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const remove = async (worker) => {
    try {
      await workersApi.remove(worker.id);
      if (registered?.id === worker.id) setRegistered(null);
      await refresh();
    } catch (err) {
      setError(
        err?.response?.data?.detail || err?.message || "Could not remove.",
      );
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <header className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl bg-primary-soft text-primary
                     flex items-center justify-center shrink-0"
        >
          <UserPlus size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text">Registration</h1>
          <p className="text-sm text-text-secondary">
            Register a worker and hand them their link. The link runs their
            allotted training program, issues their certificate, and takes
            their assessment — all on their own phone.
          </p>
        </div>
      </header>

      {registered && (
        <Panel>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Check size={18} className="text-success shrink-0" />
              <p className="text-sm font-medium text-text">
                {registered.first_name} {registered.last_name} is registered
                and allotted{" "}
                <span className="text-primary">{registered.program_name}</span>.
              </p>
            </div>
            <p className="text-xs text-text-secondary">
              {registered.photos_used === 1
                ? "1 photo enrolled"
                : `${registered.photos_used} photos enrolled`}
              {registered.photos_skipped?.length
                ? ` — ${registered.photos_skipped.length} skipped: ` +
                  registered.photos_skipped
                    .map((skip) => skip.reason)
                    .join(" ")
                : ""}{" "}
              · cameras will now recognise them by name.
            </p>
            <p className="text-xs text-text-secondary">
              Give them this link — it is theirs alone, and it resumes
              wherever they leave off:
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code
                className="text-xs sm:text-sm text-text bg-subtle border border-border
                           rounded-lg px-3 py-2 break-all"
              >
                {window.location.origin}
                {registered.link_path}
              </code>
              <CopyLinkButton linkPath={registered.link_path} />
              <Button
                variant="ghost"
                size="sm"
                icon={ExternalLink}
                onClick={() => window.open(registered.link_path, "_blank")}
              >
                Open
              </Button>
            </div>
          </div>
        </Panel>
      )}

      <Panel title="Register a worker" icon={UserPlus}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First name" required>
              <input
                value={form.first_name}
                onChange={set("first_name")}
                maxLength={60}
                placeholder="Asha"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Last name" required>
              <input
                value={form.last_name}
                onChange={set("last_name")}
                maxLength={60}
                placeholder="Kumari"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Employee ID" required>
              <input
                value={form.employee_id}
                onChange={set("employee_id")}
                maxLength={60}
                placeholder="VG-0412"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Designation" required>
              <input
                value={form.designation}
                onChange={set("designation")}
                maxLength={60}
                placeholder="Fitter"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Department">
              <input
                value={form.department}
                onChange={set("department")}
                maxLength={60}
                placeholder="Production"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Phone">
              <input
                value={form.phone}
                onChange={set("phone")}
                maxLength={60}
                placeholder="98xxxxxxxx"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Date of birth">
              <input
                type="date"
                value={form.dob}
                onChange={set("dob")}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Date of joining">
              <input
                type="date"
                value={form.date_of_joining}
                onChange={set("date_of_joining")}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Blood group">
              <select
                value={form.blood_group}
                onChange={set("blood_group")}
                className={INPUT_CLASS}
              >
                <option value="">Not known</option>
                {BLOOD_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Emergency contact">
              <div className="flex gap-2">
                <input
                  value={form.emergency_name}
                  onChange={set("emergency_name")}
                  maxLength={60}
                  placeholder="Name"
                  className={INPUT_CLASS}
                />
                <input
                  value={form.emergency_phone}
                  onChange={set("emergency_phone")}
                  maxLength={60}
                  placeholder="Phone"
                  className={INPUT_CLASS}
                />
              </div>
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              Photographs <span className="text-danger">*</span>
              <span className="ml-2 normal-case font-normal text-text-muted">
                {photos.length}/{MAX_PHOTOS} — at least {MIN_PHOTOS} clear photo
                of the face
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {photos.map((photo, index) => (
                <div key={photo.url} className="relative">
                  <img
                    src={photo.url}
                    alt={`Photo ${index + 1}`}
                    className="w-16 h-16 rounded-lg object-cover border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    aria-label={`Remove photo ${index + 1}`}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full
                               bg-surface border border-border text-text-secondary
                               flex items-center justify-center shadow-sm"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label
                  className="w-16 h-16 rounded-lg border border-dashed border-border
                             text-text-secondary flex flex-col items-center
                             justify-center gap-0.5 cursor-pointer bg-subtle"
                >
                  <ImagePlus size={18} />
                  <span className="text-[10px]">Add</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={addPhotos}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <p className="text-xs text-text-muted">
              These become the worker's picture here and their enrollment in
              Face Recognition — cameras will know them by name, in green,
              never as an alarm.
            </p>
          </div>

          {formError && (
            <p
              role="alert"
              className="text-xs text-danger bg-danger-soft rounded-lg px-3 py-2"
            >
              {formError}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              icon={Check}
              onClick={submit}
              loading={saving}
              disabled={!valid}
            >
              Register worker
            </Button>
            <p className="text-xs text-text-muted">
              A training program is allotted automatically at registration.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Registered workers" icon={Users}>
        {workers === null ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : workers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nobody registered yet"
            description="Register the first worker above — their training link appears the moment you save."
          />
        ) : (
          <ul className="divide-y divide-border -my-2">
            {workers.map((worker) => (
              <li
                key={worker.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
              >
                <WorkerAvatar
                  worker={worker}
                  name={`${worker.first_name} ${worker.last_name}`}
                  size="w-10 h-10"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text truncate">
                    {worker.first_name} {worker.last_name}
                    <span className="ml-2 text-xs font-normal text-text-muted">
                      {worker.employee_id}
                    </span>
                  </p>
                  <p className="text-xs text-text-secondary truncate">
                    {worker.designation}
                    {worker.department ? ` · ${worker.department}` : ""}
                    {" · "}
                    {worker.program_name}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge worker={worker} />
                  <CopyLinkButton linkPath={worker.link_path} />
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    onClick={() => remove(worker)}
                    aria-label={`Remove ${worker.first_name} ${worker.last_name}`}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {error && (
        <Panel>
          <ErrorState detail={error} onRetry={refresh} />
        </Panel>
      )}
    </div>
  );
}
