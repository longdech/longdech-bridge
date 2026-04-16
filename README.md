# Bridge Core (@longdech/bridge)

**Bridge Core** là một bộ hạ tầng Frontend (Data Infrastructure) chuyên nghiệp, được thiết kế để chuẩn hóa cách ứng dụng React / Next.js giao tiếp với API. Thư viện cung cấp lớp trừu tượng (Abstraction Layer) mạnh mẽ để tự động hóa React Query, quản lý Auth Token và đồng bộ dữ liệu.

## ✨ Tính năng chính

- 🚀 **Zero External Dependencies:** Thư viện thuần túy, không phụ thuộc vào các thư viện bên ngoài (lodash, v.v.), giúp tối ưu bundle size.
- 🔗 **Hybrid Mapping:** Cơ chế ánh xạ dữ liệu linh hoạt thông qua **String Path** hoặc **Callback Function** (Type-safe & High performance).
- 🔐 **Smart Token Management:** Hệ thống quản lý Access/Refresh Token tích hợp hàng đợi (queue), xử lý race-condition khi làm mới token.
- 🛠️ **Automated React Query:** Tự động hóa việc tạo Hooks (useList, useDetail, useMutation...) thông qua Service Factory.
- 🌍 **Multi-tenant & Locale Support:** Kiến trúc sẵn sàng cho các ứng dụng đa ngôn ngữ và đa nền tảng.

---

## 📂 Kiến thức kiến trúc

| Module | Vai trò |
| :--- | :--- |
| **TokenManager** | Xử lý Authentication: Lưu trữ, kiểm tra hiệu lực và làm mới token. |
| **HttpClient** | Wrapper trên Axios: Làm giàu request (token, locale, deduplication). |
| **ResponseMapper** | Chuyển đổi dữ liệu: Ánh xạ API response sang cấu hình chuẩn của dự án. |
| **ServiceProvider** | Factory: Tạo trọn bộ API + React Query Hooks dựa trên resource endpoint. |
| **QueryKeys** | Key Factory: Chuẩn hóa Query Key, đảm bảo tính deterministic cho cache. |

---

## 🛠️ Hướng dẫn sử dụng

### 1. Cấu hình Token Manager
Sử dụng `TokenManager` để quản lý phiên đăng nhập và luồng làm mới token.

```typescript
import { TokenManager } from "@longdech/bridge";

const tokenManager = new TokenManager({
  getAccessToken: () => localStorage.getItem("access_token"),
  getRefreshToken: () => localStorage.getItem("refresh_token"),
  executeRefreshToken: async () => {
    // Gọi API refresh token của bạn
    const res = await api.auth.refresh(); 
    return { accessToken: res.at, refreshToken: res.rt };
  },
  onInvalidRefreshToken: () => {
    // Xử lý khi không thể refresh (ví dụ: logout)
    window.location.href = "/login";
  }
});
```

### 2. Khởi tạo HttpClient
Quản lý tập trung baseURL và các logic enrichment (Headers, Locale).

```typescript
import { HttpClient } from "@longdech/bridge";

const httpClient = new HttpClient({
  baseURL: "https://api.example.com",
  tokenManager, // Gắn manager để tự động xử lý Bearer token
  enableDeduplication: true // Chống trùng lặp request GET
});
```

### 3. Định nghĩa Service với Hybrid Mapping
Sử dụng `createServiceProvider` để tạo API layer một cách nhanh chóng.

```typescript
import { createServiceProvider, createQueryKeys } from "@longdech/bridge";

const userKeys = createQueryKeys("users");
const defineService = createServiceProvider(httpClient, {
  // Cấu hình mapping mặc định
  listDataPath: "data",
  listTotalPath: (res) => res.meta?.total_count // Hỗ trợ Type-safe callback
});

export const userService = defineService("/users", userKeys);
```

### 4. Sử dụng trong React Component
Sử dụng trực tiếp các hooks được sinh ra tự động.

```tsx
const UserList = () => {
  const { data, isLoading } = userService.hooks.useList({ status: "active" });
  const { mutate: deleteUser } = userService.hooks.useDelete();

  return (
    <ul>
      {data?.map(user => (
        <li key={user.id}>
          {user.name} 
          <button onClick={() => deleteUser(user.id)}>Xóa</button>
        </li>
      ))}
    </ul>
  );
};
```

---

## ⚡️ Ưu điểm kỹ thuật

1. **Type-Safety:** Tận dụng tối đa sức mạnh của TypeScript để ngăn lỗi từ lớp dữ liệu.
2. **Performance:** Tích hợp sẵn cơ chế **Deduplication** cho request GET.
3. **Mở rộng:** Dễ dàng ghi đè (override) các method API hoặc Hooks cho từng trường hợp cụ thể.
4. **Consistency:** Đảm bảo toàn bộ ứng dụng sử dụng chung một chuẩn giao tiếp dữ liệu.

---

## 📦 Phát triển

```bash
# Cài đặt
pnpm install

# Kiểm tra kiểu
pnpm typecheck

# Đóng gói
pnpm build
```

---
**@longdech/bridge** - Professional Data Infrastructure for React Applications.

Package đã được cấu hình để publish với tên:

`@longdech/bridge`

Các bước release:

```bash
pnpm install
pnpm typecheck
pnpm build
npm login
npm publish --access public
```

> Nếu đây là lần đầu publish package scope `@longdech`, cần dùng `--access public`.
> Nếu gặp `E403` như hiện tại, hãy dùng `NPM_TOKEN` dạng **Automation token** hoặc **Granular access token có quyền publish + bypass 2FA**.

## CI publish theo tag

Repo đã có workflow `/.github/workflows/publish.yml`.

- Push tag dạng `v*` (ví dụ: `v1.0.1`) sẽ tự publish lên npm.
- Hoặc chạy tay từ `workflow_dispatch`.
- Cần tạo secret `NPM_TOKEN` trong GitHub repo settings.

File `.npmrc.example` đã được thêm để làm mẫu cấu hình local/CI.
