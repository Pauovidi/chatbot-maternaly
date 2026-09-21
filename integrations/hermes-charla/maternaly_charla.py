#!/usr/bin/env python3
"""Write confirmed Maternaly Charla Informativa reservations to Google Sheets."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

from google.oauth2 import service_account
from googleapiclient.discovery import build


SPREADSHEET_ID = "1J1YvoIgaODPK8O4_kVICMNoxVDuEBivXjOKFdOWqte8"
SERVICE_ID = "SER_CHARLA_INFO_EMBARAZO_1_20"
KEY_PATH = os.environ.get(
    "MATERNALY_GOOGLE_SERVICE_ACCOUNT_FILE",
    "/opt/data/maternaly-google-service-account.json",
)
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
SHEET_BASE_DATE = dt.date(1899, 12, 30)
OPEN_STATUSES = {"activa", "pendiente confirmar", "preinscrita", "confirmada"}
GROUP_HEADERS = [
    "inscripcion_id",
    "cliente_id",
    "nombre",
    "apellidos",
    "telefono",
    "email",
    "grupo_id",
    "servicio_id",
    "fecha_inscripcion",
    "canal_origen",
    "precio_acordado",
    "estado_pago",
    "estado_inscripcion",
    "fpp",
    "fecha_nacimiento_bebe",
    "pareja_nombre",
    "observaciones",
]


def emit(payload: dict[str, Any], exit_code: int = 0) -> int:
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    return exit_code


def blocked(code: str, message: str, **extra: Any) -> int:
    return emit({"ok": False, "outcome": "blocked", "code": code, "message": message, **extra})


def clean_header(value: Any) -> str:
    text_value = unicodedata.normalize("NFKD", str(value or ""))
    text_value = "".join(ch for ch in text_value if not unicodedata.combining(ch))
    text_value = text_value.strip().lower().replace("-", "_").replace(" ", "_")
    return re.sub(r"[^a-z0-9_]+", "", text_value)


def text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def normalized_phone(value: Any) -> str:
    digits = re.sub(r"\D+", "", text(value))
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("34") and len(digits) == 11:
        return digits
    if len(digits) == 9:
        return "34" + digits
    return digits


def parse_date(value: Any) -> dt.date | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        try:
            return SHEET_BASE_DATE + dt.timedelta(days=float(value))
        except (OverflowError, ValueError):
            return None
    raw = text(value)
    if re.fullmatch(r"\d+(?:\.\d+)?", raw):
        try:
            return SHEET_BASE_DATE + dt.timedelta(days=float(raw))
        except (OverflowError, ValueError):
            return None
    candidate = raw.replace("Z", "+00:00")
    try:
        return dt.datetime.fromisoformat(candidate).date()
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return dt.datetime.strptime(raw[:10], fmt).date()
        except ValueError:
            continue
    return None


def sheet_date(value: dt.date) -> int:
    return (value - SHEET_BASE_DATE).days


def find_header(rows: list[list[Any]], required: set[str]) -> tuple[int, list[str]]:
    for index, row in enumerate(rows[:40]):
        headers = [clean_header(cell) for cell in row]
        if required.issubset(set(headers)):
            return index, headers
    raise ValueError("sheet_header_not_found")


def row_map(headers: list[str], row: list[Any]) -> dict[str, Any]:
    return {header: (row[i] if i < len(row) else "") for i, header in enumerate(headers)}


def get_first(row: dict[str, Any], *names: str) -> Any:
    for name in names:
        value = row.get(clean_header(name), "")
        if value not in (None, ""):
            return value
    return ""


def read_tab(service: Any, title: str) -> tuple[int, list[str], list[dict[str, Any]]]:
    result = (
        service.spreadsheets()
        .values()
        .get(
            spreadsheetId=SPREADSHEET_ID,
            range=f"'{title}'!A1:AZ5000",
            valueRenderOption="UNFORMATTED_VALUE",
        )
        .execute()
    )
    values = result.get("values", [])
    required = {
        "sesiones": {"sesion_id", "fecha", "estado_sesion"},
        "inscripciones": {"inscripcion_id", "grupo_id", "telefono", "estado_inscripcion"},
        "clientes_local": {"cliente_id", "telefono_normalizado"},
        "interacciones_chatbot": {"interaccion_id", "fecha_hora"},
    }[clean_header(title)]
    header_index, headers = find_header(values, required)
    return header_index, headers, [row_map(headers, row) for row in values[header_index + 1 :]]


def digest_key(phone: str, session_id: str) -> str:
    return hashlib.sha256(f"charla_embarazo_1_20|{phone}|{session_id}".encode()).hexdigest()[:32]


def split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split()
    return (parts[0], " ".join(parts[1:])) if parts else ("", "")


def row_values(headers: list[str], values: dict[str, Any]) -> list[Any]:
    normalized = {clean_header(k): v for k, v in values.items()}
    return [normalized.get(header, "") for header in headers]


def append_row(service: Any, title: str, headers: list[str], values: dict[str, Any], anchor_row: int = 3) -> None:
    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{title}'!A{anchor_row}",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        includeValuesInResponse=False,
        body={"majorDimension": "ROWS", "values": [row_values(headers, values)]},
    ).execute()


def session_tab_title(session: dict[str, Any], session_date: dt.date) -> str:
    center = text(get_first(session, "centro", "center", "sede", "ubicacion")) or "Sesión"
    safe_center = re.sub(r"[\[\]*?/\\:]+", " ", center).strip()
    return f"GRP_ Charla {safe_center} {session_date.isoformat()}"[:100]


def profile_tabs(service: Any) -> dict[str, int]:
    result = service.spreadsheets().get(
        spreadsheetId=SPREADSHEET_ID,
        fields="sheets.properties(sheetId,title)",
    ).execute()
    return {
        str(item["properties"]["title"]): int(item["properties"]["sheetId"])
        for item in result.get("sheets", [])
        if item.get("properties", {}).get("title")
    }


def ensure_group_tab(service: Any, title: str, session: dict[str, Any], session_date: dt.date) -> None:
    tabs = profile_tabs(service)
    if title in tabs:
        return
    response = service.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={"requests": [{"addSheet": {"properties": {"title": title}}}]},
    ).execute()
    if not response.get("replies"):
        raise RuntimeError("session_tab_create_failed")
    center = text(get_first(session, "centro", "center", "sede", "ubicacion"))
    start = text(get_first(session, "hora_inicio", "inicio", "start_time", "hora"))
    group_id = text(get_first(session, "grupo_id", "group_id"))
    values = [
        [f"Inscripciones — {SERVICE_ID} · {center} · {session_date.isoformat()} {start}"],
        ["Servicio", "Charla", "Centro", center, "Horario", start, "Fecha", session_date.isoformat(), "Grupo", group_id, "Fuente", "Inscripciones"],
        ["VISTA GENERADA AUTOMÁTICAMENTE. Editar la pestaña Inscripciones como fuente de verdad."],
        GROUP_HEADERS,
    ]
    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{title}'!A1",
        valueInputOption="USER_ENTERED",
        body={"majorDimension": "ROWS", "values": values},
    ).execute()


def append_group_tab_row(
    service: Any,
    session: dict[str, Any],
    session_date: dt.date,
    registration_values: dict[str, Any],
) -> tuple[str, bool]:
    title = session_tab_title(session, session_date)
    ensure_group_tab(service, title, session, session_date)
    existing = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{title}'!A4:Q2000",
        valueRenderOption="UNFORMATTED_VALUE",
    ).execute().get("values", [])
    registration_id = text(registration_values.get("inscripcion_id"))
    if any(row and text(row[0]) == registration_id for row in existing[1:]):
        return title, False
    append_row(service, title, GROUP_HEADERS, registration_values, anchor_row=4)
    return title, True


def load_sheets() -> tuple[Any, list[dict[str, Any]], list[str], list[dict[str, Any]], list[str], list[dict[str, Any]], list[str]]:
    if not Path(KEY_PATH).is_file():
        raise FileNotFoundError(KEY_PATH)
    credentials = service_account.Credentials.from_service_account_file(KEY_PATH, scopes=SCOPES)
    service = build("sheets", "v4", credentials=credentials, cache_discovery=False)
    _, _, sessions = read_tab(service, "Sesiones")
    _, registration_headers, registrations = read_tab(service, "Inscripciones")
    _, client_headers, clients = read_tab(service, "Clientes_Local")
    _, interaction_headers, _ = read_tab(service, "Interacciones_Chatbot")
    return service, sessions, registration_headers, registrations, client_headers, clients, interaction_headers


def list_sessions(payload: dict[str, Any]) -> int:
    try:
        service, sessions, _, registrations, _, _, _ = load_sheets()
    except Exception:
        return blocked("sheets_unavailable", "No he podido consultar las sesiones publicadas.")
    requested_date = parse_date(payload.get("date") or payload.get("sessionDate"))
    result: list[dict[str, Any]] = []
    today = dt.date.today()
    for row in sessions:
        session_id = text(get_first(row, "sesion_id", "session_id", "id_sesion", "id"))
        session_date = parse_date(get_first(row, "fecha", "date", "dia"))
        status = text(get_first(row, "estado_sesion", "estado", "status")).casefold()
        visible = text(get_first(row, "visible_chatbot", "visible")).casefold()
        if not session_id or session_date is None or session_date < today:
            continue
        if requested_date is not None and session_date != requested_date:
            continue
        if status and status not in {"programada", "activa", "publicada"}:
            continue
        if visible and visible not in {"sí", "si", "yes", "true", "1"}:
            continue
        group_id = text(get_first(row, "grupo_id", "group_id"))
        capacity_value = get_first(row, "capacidad_total", "capacity_total", "capacidad")
        try:
            capacity = int(float(capacity_value)) if text(capacity_value) else None
        except (TypeError, ValueError):
            capacity = None
        occupied = 0
        for registration in registrations:
            if text(get_first(registration, "grupo_id", "group_id")) != group_id:
                continue
            if text(get_first(registration, "estado_inscripcion", "estado", "status")).casefold() not in OPEN_STATUSES:
                continue
            occupied += 2 if text(get_first(registration, "pareja_nombre", "partner_name", "acompanante")) else 1
        result.append({
            "sessionId": session_id,
            "date": session_date.isoformat(),
            "startTime": text(get_first(row, "hora_inicio", "inicio", "start_time", "hora")),
            "location": text(get_first(row, "centro", "sede", "location")),
            "capacity": capacity,
            "occupied": occupied,
            "availability": "unknown" if capacity is None else max(capacity - occupied, 0),
        })
    result.sort(key=lambda item: (item["date"], item["startTime"], item["sessionId"]))
    return emit({"ok": True, "outcome": "sessions", "sessions": result})


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--dry-run", action="store_true")
    args, _ = parser.parse_known_args()
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return blocked("invalid_json", "No he podido leer los datos de la reserva.")
    if not isinstance(payload, dict):
        return blocked("invalid_payload", "Los datos de la reserva no tienen un formato válido.")
    action = text(payload.get("action") or payload.get("mode")).casefold()
    if action in {"list", "list_sessions", "availability", "available_sessions"}:
        return list_sessions(payload)
    if payload.get("confirmed") is not True:
        return blocked("confirmation_required", "Necesito una confirmación explícita antes de reservar.")

    session_id = text(payload.get("sessionId"))
    full_name = re.sub(r"\s+", " ", text(payload.get("fullName")))
    phone = normalized_phone(payload.get("phone"))
    due_date = parse_date(payload.get("fppOrDueDate"))
    try:
        people_count = int(payload.get("peopleCount", 0))
    except (TypeError, ValueError):
        people_count = 0
    partner_name = re.sub(r"\s+", " ", text(payload.get("partnerName")))
    if not session_id:
        return blocked("missing_session", "Indica la sesión concreta que quieres reservar.")
    if not full_name:
        return blocked("missing_full_name", "Necesito nombre y apellidos.")
    if not phone:
        return blocked("missing_phone", "Necesito un teléfono de contacto.")
    if len(phone) < 9:
        return blocked("invalid_phone", "Necesito un teléfono de contacto válido.")
    if people_count not in (1, 2):
        return blocked("invalid_people_count", "El número de asistentes debe ser 1 o 2.")
    if people_count == 2 and not partner_name:
        return blocked("missing_partner", "Necesito el nombre de la persona acompañante.")
    if due_date is None:
        return blocked("invalid_due_date", "Necesito una fecha probable de parto válida.")

    try:
        service, sessions, registration_headers, registrations, client_headers, clients, interaction_headers = load_sheets()
    except Exception:
        return blocked("sheets_unavailable", "No he podido consultar la hoja de reservas.")

    session = next(
        (row for row in sessions if text(get_first(row, "sesion_id", "session_id", "id_sesion", "id")) == session_id),
        None,
    )
    if session is None:
        return blocked("session_not_found", "La sesión indicada ya no está publicada.")
    session_date = parse_date(get_first(session, "fecha", "date", "dia"))
    if session_date is None:
        return blocked("session_date_missing", "La sesión no tiene una fecha válida en la hoja.")
    if session_date < dt.date.today():
        return blocked("session_in_past", "Esa sesión ya ha pasado. Puedo buscar otra fecha.")
    status = text(get_first(session, "estado_sesion", "estado", "status")).casefold()
    visible = text(get_first(session, "visible_chatbot", "visible")).casefold()
    if status and status not in {"programada", "activa", "publicada"}:
        return blocked("session_not_active", "Esa sesión no está abierta para reservas.")
    if visible and visible not in {"sí", "si", "yes", "true", "1"}:
        return blocked("session_not_visible", "Esa sesión no está publicada para el chatbot.")

    gestational_days = 280 - (due_date - session_date).days
    if gestational_days < 7 or gestational_days >= 147:
        return blocked(
            "outside_weeks_1_20",
            "La fecha probable de parto queda fuera del tramo de semanas 1 a 20 para esa sesión.",
        )

    group_id = text(get_first(session, "grupo_id", "group_id"))
    key = digest_key(phone, session_id)
    suffix = key[:16].upper()
    registration_id = f"INS_HERMES_{suffix}"
    interaction_id = f"INT_HERMES_{suffix}"
    existing = None
    for row in registrations:
        row_phone = normalized_phone(get_first(row, "telefono", "phone"))
        row_group = text(get_first(row, "grupo_id", "group_id"))
        row_status = text(get_first(row, "estado_inscripcion", "estado", "status")).casefold()
        notes = text(get_first(row, "observaciones", "notas", "notes"))
        if row_status in OPEN_STATUSES and (key in notes or (row_phone == phone and row_group in {group_id, session_id})):
            existing = row
            break
    if existing is not None:
        existing_id = text(get_first(existing, "inscripcion_id", "registration_id")) or registration_id
        return emit({
            "ok": True,
            "outcome": "already_persisted",
            "registrationId": existing_id,
            "sessionId": session_id,
            "message": "La reserva ya estaba registrada.",
        })

    capacity_value = get_first(session, "capacidad_total", "capacity_total", "capacidad")
    try:
        capacity = int(float(capacity_value)) if text(capacity_value) else None
    except (TypeError, ValueError):
        capacity = None
    occupied = 0
    for row in registrations:
        row_group = text(get_first(row, "grupo_id", "group_id"))
        row_status = text(get_first(row, "estado_inscripcion", "estado", "status")).casefold()
        if row_group == group_id and row_status in OPEN_STATUSES:
            try:
                count = int(get_first(row, "people_count", "personas", "plazas"))
            except (TypeError, ValueError):
                count = 2 if text(get_first(row, "pareja_nombre", "partner_name", "acompanante")) else 1
            occupied += max(count, 1)
    if capacity is not None and occupied + people_count > capacity:
        return blocked("session_full", "Esa sesión no tiene plazas suficientes.")

    first_name, last_name = split_name(full_name)
    existing_client = next(
        (row for row in clients if normalized_phone(get_first(row, "telefono_normalizado", "telefono", "phone")) == phone),
        None,
    )
    client_id = text(get_first(existing_client or {}, "cliente_id", "client_id")) or f"CLI_HERMES_{hashlib.sha256(phone.encode()).hexdigest()[:16].upper()}"
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    notes = " | ".join(
        part for part in (text(payload.get("notes")), f"trace:{key}", f"session:{session_id}", f"personas:{people_count}") if part
    )
    if args.dry_run:
        return emit({
            "ok": True,
            "outcome": "dry_run",
            "sessionId": session_id,
            "sessionDate": session_date.isoformat(),
            "gestationalDays": gestational_days,
            "registrationId": registration_id,
            "clientExisting": existing_client is not None,
            "wouldAppend": ["Inscripciones"] + ([] if existing_client is not None else ["Clientes_Local"]) + ["Interacciones_Chatbot"],
        })

    registration_values = {
        "inscripcion_id": registration_id, "cliente_id": client_id, "nombre": first_name,
        "apellidos": last_name, "telefono": phone, "email": text(payload.get("email")),
        "grupo_id": group_id, "servicio_id": SERVICE_ID,
        "fecha_inscripcion": now, "canal_origen": "whatsapp", "precio_acordado": 0,
        "estado_pago": "no_aplica", "estado_inscripcion": "Activa", "fpp": sheet_date(due_date),
        "pareja_nombre": partner_name, "consentimiento_comunicaciones": "", "observaciones": notes,
    }
    client_values = {
        "cliente_id": client_id, "nombre": first_name, "apellidos": last_name,
        "telefono_normalizado": phone, "email": text(payload.get("email")), "fpp": sheet_date(due_date),
        "canal_origen": "whatsapp", "estado_cliente": "lead", "notas_privadas": notes,
        "fecha_alta": now, "ultima_actualizacion": now,
    }
    interaction_values = {
        "interaccion_id": interaction_id, "fecha_hora": now, "canal": "whatsapp", "telefono": phone,
        "cliente_id": client_id, "servicio_id": SERVICE_ID, "intent": "reservar_charla_informativa",
        "accion_realizada": "hermes_charla_direct_registration", "resultado": "confirmed",
        "requiere_humano": "no", "conversation_id": key, "observaciones": notes,
    }
    session_tab_title_value = session_tab_title(session, session_date)
    session_tab_synced = False
    try:
        lock_path = Path("/opt/data/maternaly-charla-write.lock")
        with lock_path.open("a+") as lock_file:
            try:
                import fcntl
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            except (ImportError, OSError):
                pass
            append_row(service, "Inscripciones", registration_headers, registration_values)
            if existing_client is None:
                append_row(service, "Clientes_Local", client_headers, client_values)
            try:
                session_tab_title_value, _ = append_group_tab_row(
                    service,
                    session,
                    session_date,
                    registration_values,
                )
                session_tab_synced = True
            except Exception:
                notes = f"{notes} | session_tab_sync_failed"
                interaction_values["observaciones"] = notes
            append_row(service, "Interacciones_Chatbot", interaction_headers, interaction_values)
    except Exception:
        return blocked("write_failed", "No he podido completar la reserva en la hoja. No la confirmes como realizada.")
    return emit({
        "ok": True,
        "outcome": "confirmed",
        "registrationId": registration_id,
        "sessionId": session_id,
        "sessionDate": session_date.isoformat(),
        "sessionTab": session_tab_title_value,
        "sessionTabSynced": session_tab_synced,
        "message": "Reserva registrada correctamente.",
    })


if __name__ == "__main__":
    raise SystemExit(main())
