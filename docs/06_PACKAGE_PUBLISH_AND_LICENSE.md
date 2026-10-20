# 06 — Package, publish và license boundary

## 1. Mục tiêu

Package là artifact bất biến được Studio tạo, Marketplace phân phối, Desktop Client tải và Runtime thực thi. Mỗi bên phải kiểm tra đúng phần trách nhiệm nhưng dùng chung schema/digest/signature contract.

Tài liệu phân biệt hai artifact không được trộn:

- **Studio installer** (`A2MaTeXStudio.exe`/NSIS): cài chính IDE, chứa EULA/config release và được ký
  bằng desktop code-signing certificate.
- **A2MaTeX Package**: output automation do developer build trong Studio, được Marketplace/Desktop
  Client/Runtime tiêu thụ theo các mục dưới đây.

Onboarding state, installer consent và app update metadata không nằm trong A2MaTeX Package.

```text
Project source
  → validate
  → compile IR
  → collect assets/metadata
  → canonicalize + digest
  → sign
  → verify locally
  → upload draft
  → Marketplace scan/review/release
  → Desktop download + verify
  → license authorization
  → Runtime execute
```

## 2. Package layout đề xuất

Extension chính thức còn `OPEN`; dùng tên logic `A2MaTeX Package` trong code/spec.

```text
package-root/
├── manifest.json
├── executable/
│   ├── main.ir.json
│   └── source-map.json       # có thể loại/redact ở production policy
├── assets/
├── catalog/
│   └── node-lock.json        # exact handler/node dependencies
├── integrity.json
└── signature.json
```

Không đóng gói:

- `.a2matex/workspace.json`, cache, recovery draft;
- source credentials/tokens/private keys;
- absolute path hoặc machine/user identifiers;
- dev logs và unreferenced assets;
- arbitrary executable binary nếu platform policy chưa cho phép.

## 3. Package manifest

```ts
export interface PackageManifest {
  packageSchemaVersion: number;
  packageId: string;
  projectId: string;
  version: string;
  displayName: string;
  description?: string;
  publisher: { id: string; name?: string };
  entrypoint: string;
  minimumRuntimeVersion: string;
  supportedIrVersions: number[];
  permissions: PermissionDeclaration[];
  capabilities: string[];
  assets: PackageAssetEntry[];
  build: {
    compilerVersion: string;
    sourceRevision?: string;
    reproducible: boolean;
  };
}
```

Release version dùng SemVer. Marketplace phải reject reuse cùng `(packageId, version)` với digest khác.

## 4. Deterministic build

- Normalize separator/path, JSON encoding và file ordering.
- Timestamp không tham gia content digest hoặc lấy từ reproducible build input.
- Digest từng file, rồi digest manifest integrity canonical.
- Symlink bị reject hoặc dereference theo policy cố định; mặc định reject.
- Enforce max file/package size và allowed path/file type.
- Build chạy trong main/worker process, không block renderer.
- Output mới được ghi vào temp và atomic move sau successful verification.

Hai build từ cùng source + dependency lock + compiler version phải cho cùng semantic digest.

## 5. Integrity và signing

`integrity.json` liệt kê path, size, SHA-256 (hoặc algorithm được platform chốt). `signature.json` ký canonical integrity/manifest envelope và chứa key ID/certificate chain cần thiết.

Signing options cần quyết định:

1. **Remote signing khuyến nghị cho production**: Studio upload digest bằng authenticated publisher session; service ký/attest. Private key platform không về máy developer.
2. **Developer key qua OS keystore**: phù hợp self-sign/development, cần rotation/revocation/recovery.
3. **Unsigned development artifact**: chỉ chạy ở explicit developer mode, không publish/production.

Không thiết kế private signing key dưới dạng text setting trong renderer.

## 6. Permission declaration

Permission được tính từ resolved node definitions và project features, ví dụ:

```text
android.input
android.screenshot
android.accessibility
network.outbound
asset.read
credential.use:<scope>
```

Build hiển thị diff giữa manifest declaration và permission suy ra:

- thiếu permission: blocking error;
- permission thừa: warning/error theo policy để tránh xin quyền quá rộng;
- permission mới so với release trước: bắt buộc confirm và Marketplace có thể yêu cầu review lại.

## 7. Publish workflow

```text
idle
 → validating
 → building
 → verifying
 → creating_draft
 → uploading
 → processing
 → submitted
 → review_pending / published / rejected
```

Publish use case:

1. Kiểm authenticated publisher và ownership của `packageId`.
2. Full validation + clean build từ immutable snapshot.
3. Local verify và permission/release diff.
4. Create Marketplace draft với idempotency key.
5. Upload resumable/chunked nếu package size yêu cầu.
6. Server verify digest/signature/schema/policy.
7. Submit release; lưu remote draft/release ID trong local publish history không nhạy cảm.

Retry upload không tạo release trùng. User đóng IDE không được làm mất khả năng query lại trạng thái draft đã tạo.

## 8. Marketplace boundary

Studio cần API contract cho:

- publisher session/profile và package ownership;
- create/update release draft;
- asset/package upload và progress;
- server validation issues có source/path mapping khi có thể;
- submit/cancel draft;
- query review/release status.

Studio không sở hữu:

- payment, pricing settlement, buyer entitlement;
- reviewer workflow nội bộ;
- download CDN policy;
- license issuance/revocation logic.

## 9. License boundary

Developer test local và end-user production là hai mode khác nhau:

- **Developer run**: authorization dựa trên developer identity/project ownership hoặc explicit dev mode; watermark/policy theo platform.
- **End-user run**: Desktop Client lấy entitlement/license decision trước khi Runtime start.

Runtime nhận một authorization grant ngắn hạn hoặc verified offline grant, không nhận marketplace password/token dài hạn. Grant nên bind tối thiểu với package ID/version/digest, subject/device/session theo policy và expiry.

Studio chỉ cần:

- biểu diễn auth/license error thống nhất;
- test package bằng developer grant;
- không tự triển khai logic entitlement;
- hỗ trợ fixture grant trong isolated test Runtime, không production.

Offline duration, device binding, concurrency và revocation là quyết định liên hệ thống còn `OPEN`.

## 10. Install/update compatibility

- Desktop verify package signature + digest trước giải nén/thực thi.
- Extract trong isolated temp directory với zip-slip/path traversal protection.
- Check Runtime/IR/handler compatibility trước activate.
- Update là side-by-side version hoặc atomic replacement; rollback policy rõ ràng.
- Runtime chỉ đọc artifact đã verify; cache key gồm package digest.

## 11. Package/publish definition of done

- Package cùng input build reproducibly và local verifier phát hiện mọi file bị sửa.
- Secret/workspace/cache không xuất hiện trong artifact fixture.
- Permission list được derive và diff với release trước.
- Publish job có progress, cancel/retry/idempotency và server issue rendering.
- Production publish từ chối unsigned/untrusted artifact.
- Desktop/Runtime consumer contract xác nhận package do Studio build có thể install/preflight/run.
