# Bridge Core (HTTP + React Query Infrastructure)

**Bridge Core** là một bộ hạ tầng frontend giúp chuẩn hóa cách ứng dụng React / Next.js làm việc với:

- HTTP client
- Token refresh
- Event communication
- TanStack Query
- Query key management
- Reusable service layer

Mục tiêu của Bridge là tạo ra một **data layer có thể tái sử dụng giữa nhiều project**, phù hợp với các codebase lớn (50k – 200k+ dòng code).

---

# Kiến trúc tổng thể

```
core/
   event-emitter.ts
   token-manager.ts
   http-client.ts
   query-keys.ts
   react-query.ts
   service-provider.ts
```

Bridge chia data layer thành các phần rõ ràng:

| Module          | Chức năng                             |
| --------------- | ------------------------------------- |
| EventEmitter    | Hệ thống event nội bộ                 |
| TokenManager    | Quản lý access token và refresh token |
| HttpClient      | HTTP client với interceptor           |
| QueryKeys       | Chuẩn hóa TanStack Query key          |
| ReactQuery      | QueryClient config                    |
| ServiceProvider | Tạo API + hooks tự động               |

---

# 1. EventEmitter

EventEmitter là lớp giúp các module giao tiếp với nhau bằng **event bất đồng bộ**.

Nó được dùng cho:

- refresh token queue
- retry request
- internal bridge communication

### Ví dụ

```
const emitter = new EventEmitter()

emitter.on("refreshDone", (token) => {
  console.log(token)
})

emitter.emit("refreshDone", "new_token")
```

### once

Listener chỉ chạy một lần.

```
emitter.once("refreshDone", handler)
```

---

# 2. TokenManager

TokenManager chịu trách nhiệm:

- lưu access token
- lưu refresh token
- xoá token khi logout
- tự kiểm tra hạn JWT bằng `jwt-decode`
- tự refresh token và gom request đồng thời về 1 lần refresh

### Ví dụ

```
const tokenManager = new TokenManager()

tokenManager.setAccessToken(token)
tokenManager.getAccessToken()

tokenManager.clear()
```

### Advanced refresh flow

```
const tokenManager = new TokenManager({
  getAccessToken: () => storage.accessToken,
  getRefreshToken: () => storage.refreshToken,
  executeRefreshToken: async () => authApi.refresh(storage.refreshToken),
  onRefreshTokenSuccess: ({ accessToken, refreshToken }) => {
    storage.accessToken = accessToken
    storage.refreshToken = refreshToken
  },
  onInvalidRefreshToken: () => redirectToLogin(),
})

const token = await tokenManager.getToken()
```

---

# 3. HttpClient

`HttpClient` là wrapper trên `axios` để chuẩn hóa HTTP layer.

Nó cung cấp:

- auto attach bearer token (nếu có `getToken`)
- request/response interceptor
- tích hợp trực tiếp với `TokenManager` để auto refresh token trước request
- có thể override hàm attach locale/domain/token khi cần

### Khởi tạo

```
const httpClient = new HttpClient({
  baseURL: API_URL,
  tokenManager,
})
```

### Request

```
httpClient.get("/users")
httpClient.get("/users", { page: 1, active: true })
httpClient.post("/users", data)
httpClient.put("/users/1", data)
httpClient.delete("/users/1")
```

---

# 4. Query Key Factory

Query keys được chuẩn hóa bằng factory.

```
const userKeys = createQueryKeys("users")
```

Các key có sẵn:

```
userKeys.all
userKeys.lists()
userKeys.list(params)
userKeys.details()
userKeys.detail(id)
userKeys.infinite(params)
```

### Ví dụ

```
queryKey: userKeys.list({ page: 1 })
```

---

# 5. React Query Configuration

Bridge cung cấp một `QueryClient` được cấu hình sẵn.

```
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
})
```

### Provider

```
<QueryClientProvider client={queryClient}>
   <App />
</QueryClientProvider>
```

---

# 6. Service Provider

ServiceProvider tạo ra:

- API functions
- React Query hooks

từ một endpoint duy nhất, đồng bộ key + cache invalidation.

### Tạo service

```
const defineService = createServiceProvider(httpClient)

export const userService = defineService("/users", userKeys)
```

### Tạo service (flexible infinite response)

Không cần ép backend trả đúng `items/nextCursor`, chỉ cần map một lần:

```typescript
const defineService = createServiceProvider(httpClient)

// Backend trả: { results: T[], next_cursor: string }
export const userService = defineService("/users", userKeys, {
  cursorParamKey: "next_cursor",
  mapInfiniteResponse: createInfiniteResponseMapper({
    itemsPath: "results",
    nextCursorPath: "next_cursor",
  }),
})

// Backend trả: { docs: T[], hasNextPage: boolean, nextPage: number }
export const postService = defineService("/posts", postKeys, {
  cursorParamKey: "page",
  mapInfiniteResponse: createInfiniteResponseMapper({
    itemsPath: "docs",
    getNextCursor: (data: any) => (data.hasNextPage ? data.nextPage : undefined),
  }),
})

// Backend trả: { data: T[], meta: { hasNextPage: boolean, nextPage: number } }
export const commentService = defineService("/comments", commentKeys, {
  cursorParamKey: "page",
  mapInfiniteResponse: createInfiniteResponseMapper({
    itemsPath: "data",
    getNextCursor: (payload: any) =>
      payload.meta?.hasNextPage ? payload.meta.nextPage : undefined,
  }),
})
```

---

# Hooks tự động

ServiceProvider tạo các hooks sau:

```
useList
useInfinite
useDetail
useCreate
useUpdate
useDelete
```

---

# Ví dụ sử dụng

### Query list

```
const { data } = userService.hooks.useList()
```

### Query detail

```
const { data } = userService.hooks.useDetail(userId)
```

### Infinite query

```
const {
  data,
  fetchNextPage,
  hasNextPage
} = userService.hooks.useInfinite()
```

Trong mọi trường hợp, `lastPage` luôn được chuẩn hóa về shape:

```
{
  items: T[],
  nextCursor?: Cursor
}
```

### Mutation

```
const { mutate } = userService.hooks.useCreate()

mutate({
  name: "John"
})
```

---

# Ví dụ cấu trúc project

```
src/
   core/
   services/
      user/
         user.keys.ts
         user.service.ts
   components/
   pages/
```

---

# Tạo service mới

### Bước 1: tạo query keys

```
export const postKeys = createQueryKeys("posts")
```

### Bước 2: tạo service

```
export const postService =
  defineService("/posts", postKeys)
```

### Bước 3: sử dụng

```
postService.hooks.useList()
postService.hooks.useCreate()
```

---

# Ưu điểm của Bridge

### 1. Chuẩn hóa data layer

Tất cả API trong project dùng cùng một pattern.

---

### 2. Reusable

Bridge có thể copy sang project khác.

---

### 3. Scalable

Thiết kế phù hợp với codebase lớn:

- 100+ API endpoints
- nhiều developer cùng làm việc

---

### 4. Tích hợp sẵn

- Axios
- TanStack Query
- Token refresh queue
- Event system

---

# Khi nào nên dùng Bridge

Bridge phù hợp cho:

- React
- Next.js
- React Native
- Large scale frontend

Đặc biệt hiệu quả với:

- enterprise dashboard
- SaaS application
- internal tools

---

# Gợi ý mở rộng trong tương lai

Bridge có thể mở rộng thêm:

### Optimistic Update Engine

Tự động update cache khi mutation.

---

### Entity Normalization

Chuẩn hóa cache giống Redux Toolkit Query.

---

### Auto Service Generator

Sinh service từ OpenAPI / Swagger.

---

### Offline Mutation Queue

Cho mobile hoặc PWA.

---

# Kết luận

Bridge Core tạo ra một **data infrastructure thống nhất** cho frontend:

- HTTP layer
- Query layer
- Service layer
- Token system
- Event system

Nhờ đó code trở nên:

- dễ mở rộng
- dễ bảo trì
- dễ tái sử dụng giữa nhiều project.

---

# Publish NPM

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
