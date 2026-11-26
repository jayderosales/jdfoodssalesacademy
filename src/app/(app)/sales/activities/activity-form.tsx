"use client";

import { useActionState, useState } from "react";
import { MapPin } from "lucide-react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { logActivity } from "../actions";

/**
 * Log a call, note or task, or check in at a field visit. "Check in here" asks the phone for its location
 * (the privacy notice covers location capture for field visits); the visit is saved with the GPS point.
 */
export function ActivityForm({ customerId, leadId, customers }: { customerId?: string; leadId?: string; customers?: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(logActivity, {});
  const [kind, setKind] = useState("call");
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);

  function checkIn() {
    setGpsMsg("Getting your location…");
    if (!("geolocation" in navigator)) return setGpsMsg("This device can't share its location.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)), acc: Math.round(p.coords.accuracy) });
        setGpsMsg(null);
        setKind("visit");
      },
      (e) => setGpsMsg(e.code === 1 ? "Location permission was denied. Allow it in your browser settings to check in." : "Couldn't get your location. Try again outside or near a window."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border p-3">
      {customerId && <input type="hidden" name="customer_id" value={customerId} />}
      {leadId && <input type="hidden" name="lead_id" value={leadId} />}
      {gps && (
        <>
          <input type="hidden" name="lat" value={gps.lat} />
          <input type="hidden" name="lng" value={gps.lng} />
          <input type="hidden" name="accuracy" value={gps.acc} />
        </>
      )}
      <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
        <Field label="Type" htmlFor="kind">
          <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="call">Call</option><option value="visit">Field visit</option><option value="message">Message</option>
            <option value="email">Email</option><option value="meeting">Meeting</option><option value="note">Note</option><option value="task">Task / follow-up</option>
          </Select>
        </Field>
        <Field label="Subject" htmlFor="subject"><Input id="subject" name="subject" required placeholder={kind === "task" ? "Call back about distributor pricing" : "Product demo, follow-up…"} /></Field>
      </div>
      {customers && !customerId && !leadId && (
        <Field label="Customer" htmlFor="customer_id">
          <Select id="customer_id" name="customer_id" defaultValue="">
            <option value="">— none —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} /></Field>
      {kind === "task" ? (
        <Field label="Due" htmlFor="due_at"><Input id="due_at" name="due_at" type="datetime-local" /></Field>
      ) : (
        <>
          <Field label="Outcome" htmlFor="outcome"><Input id="outcome" name="outcome" placeholder="Ordered, interested, call next week…" /></Field>
          <input type="hidden" name="done" value="on" />
        </>
      )}
      {kind === "visit" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button type="button" variant="outline" onClick={checkIn}><MapPin className="mr-1 h-4 w-4" />{gps ? "Update location" : "Check in here"}</Button>
          {gps && <span className="text-success">📍 {gps.lat}, {gps.lng} (±{gps.acc} m)</span>}
          {gpsMsg && <span className="text-muted-foreground">{gpsMsg}</span>}
        </div>
      )}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : kind === "visit" && gps ? "Save visit" : "Save"}</Button>
    </form>
  );
}
