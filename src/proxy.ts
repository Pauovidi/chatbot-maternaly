import { NextResponse, type NextRequest } from "next/server";

function parseBasicAuth(header: string | null): { username: string; password: string } | undefined {
  if (!header?.startsWith("Basic ")) {
    return undefined;
  }

  try {
    const decoded = atob(header.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return undefined;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return undefined;
  }
}

function canBypassMissingCredentials(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test" ||
    process.env.HOTEL_PANEL_ALLOW_LOCAL_AUTH_BYPASS === "true"
  );
}

function unauthorized(message = "Authentication required", status = 401) {
  return new NextResponse(message, {
    status,
    headers: {
      "WWW-Authenticate": 'Basic realm="Maternaly operaciones"',
    },
  });
}

export function proxy(request: NextRequest) {
  const username = process.env.PANEL_ADMIN_USERNAME ?? process.env.HOTEL_PANEL_USERNAME;
  const password = process.env.PANEL_ADMIN_PASSWORD ?? process.env.HOTEL_PANEL_PASSWORD;

  if (!username || !password) {
    return canBypassMissingCredentials()
      ? NextResponse.next()
      : unauthorized("Panel credentials are not configured", 503);
  }

  const credentials = parseBasicAuth(request.headers.get("authorization"));
  if (credentials?.username === username && credentials.password === password) {
    return NextResponse.next();
  }

  return unauthorized();
}

export const config = {
  matcher: ["/admin/:path*", "/internal/:path*", "/api/ops/:path*"],
};
