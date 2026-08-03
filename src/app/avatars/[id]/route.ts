import { readAvatar } from "@/lib/avatar/storage";

// 出上传的头像。文件存在数据卷里（不在 public/），所以要走路由读盘。
// 头像本身不算敏感信息，不做鉴权——任何人看得到用户名就看得到头像。

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = Number(id);
  // 只认纯数字；非法 id 直接 404，不让它有机会参与路径拼接
  if (!Number.isInteger(userId) || userId <= 0) {
    return new Response("Not found", { status: 404 });
  }

  const found = readAvatar(userId);
  if (!found) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.kind,
      // URL 带版本号 query，内容变了 URL 就变了，可以放心长缓存
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
