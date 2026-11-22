import { NextResponse, type NextRequest } from "next/server";

const venueHome = /^\/m\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!venueHome.test(pathname)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = pathname.slice(0, -1);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: "/m/:path*",
};
