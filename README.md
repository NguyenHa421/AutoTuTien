# AutoGame — bản extension Chrome

## Cài (2 phút)

1. Mở Chrome, vào `chrome://extensions`
2. Bật **Developer mode** (góc trên bên phải)
3. Bấm **Load unpacked**
4. Chọn đúng thư mục: `extension`
5. Vào `chrome://settings/performance`
6. Tại mục **Always keep these sites active**, chọn Add, thêm **discord.com**
7. Mở lại tab Discord (**F5**)
8. Bảng auto hiện ra, tắt chế độ **Thử, chỉ bấm ghi log**

## Bốn chế độ

Chọn ở đầu bảng điều khiển:
- **🌿 Chăm cây** — đi hết các vườn theo phạm vi đã chọn.
- **💧 Múc nước** — chỉ đứng ở màn hình Dược Viên và múc nước giếng.
- **⚔ Đánh boss** — đánh boss liên tục ở Sảnh Boss.
- **🗺 Bí cảnh** — đi bí cảnh liên tục với tổ đội.

### Đi bí cảnh

Để Discord đứng ở **sảnh tổ đội**, bạn làm đội trưởng, đã chọn bí cảnh + độ khó trong game
như bình thường, rồi bấm Chạy.

#### Cài đặt (bấm ⚙ khi đang ở chế độ Bí cảnh)

**Bí cảnh đang đi** — chọn 1 trong 7 bí cảnh (kèm cảnh giới yêu cầu) và khu vực. 

Bật *Tự nhận bí cảnh từ tên tổ đội* thì khỏi phải chọn tay (khuyến khích chọn thủ công, bot auto nhận có khả năng không đúng)

**Các ải** — gõ *Số ải*, mỗi ải chọn **⚔ Chiến đấu** hoặc **✨ Kỳ ngộ**. 

**Kỳ ngộ** — mỗi bí cảnh có vài loại kỳ ngộ, **ra ngẫu nhiên** ở các ải kỳ ngộ. 
Cần cài các *kỳ ngộ* gặp ở ải đó: mỗi kỳ ngộ có tên, các lựa chọn, và **chấm ** ở lựa chọn
muốn bấm. Gặp kỳ ngộ đó ở ải nào, bot cũng bấm đúng lựa chọn đã chấm.

Không cần cài trước hết. Cứ để bot chạy:
1. Gặp **kỳ ngộ lạ**, bot tự thêm tên + các lựa chọn vào danh
   sách, đánh dấu **chưa chấm**, và lần này để game tự chọn khi hết giờ.
2. Mở ⚙ → *Kỳ ngộ*, bấm **chấm** ở lựa chọn muốn bấm.
3. Từ lần gặp sau, bot tự bấm.

Muốn cài sẵn thì đứng ở màn hình kỳ ngộ trong game, bấm **📥 Lấy kỳ ngộ đang hiện**, hoặc
**＋ Thêm kỳ ngộ** rồi gõ tay. **✕** để xoá một kỳ ngộ.

**Thứ tự cửa · Bát Môn** — 8 cửa có nút ▲▼ để xếp. Ải có mấy cửa thì bot chọn cửa đứng
cao nhất. Mặc định: Hưu → Cảnh → Khai → Sinh → Tử → Kinh → Thương → Đỗ.

**Thể lực & sinh mệnh** — mỗi lần đứng ở sảnh, trước khi bấm *Bắt Đầu* / *Chiến Tiếp*, bot
đọc máu và thể lực của **từng thành viên** ngay trên tin nhắn tổ đội:

Khi đang chạy, phần tổng quan có thêm 2 ô: **thể lực thấp nhất** (kèm số lượt còn đi được)
và **máu thấp nhất**. Ô chuyển vàng khi thể lực chỉ còn dưới 2 lượt hoặc máu dưới ngưỡng.

**Giới hạn** — số lượt bí cảnh rồi dừng (0 = chạy đến khi hết thể lực). Mỗi lần thấy nút *Chiến Tiếp* tính là
xong 1 lượt.

### Đánh boss

Cần để Discord đứng ở **Sảnh Boss**.

```
Sảnh Boss: bấm "Tấn Công Boss"
   ↓
Đang đánh: bấm "Bỏ Qua Animation"
   ↓
Tổng kết:  bấm "Quay Lại Sảnh Boss"
   ↓
Sảnh Boss: bấm "Hồi Máu"
   ↓ chờ hết cooldown (mặc định 30 giây)
bấm "Làm Mới" rồi đánh tiếp
```

Chỉnh trong ⚙ → *Đánh boss*: cooldown sau hồi máu, nhịp thử lại, số lượt đánh rồi dừng
(0 = đánh mãi), và tên 4 nút phòng khi game đổi chữ. 


### Chỉ múc nước

Cần để Discord đứng ở **màn hình Dược Viên** (chỗ có nút Múc Nước Giếng và Làm Mới).

```
bấm "Múc Nước Giếng"
   ↓ chờ 10 phút 15 giây
bấm "Làm Mới" rồi xem nút múc nước sáng chưa
   ├─ chưa → 10 giây sau bấm "Làm Mới" lại, xem tiếp
   └─ rồi  → bấm "Múc Nước Giếng" → quay lại chờ 10:15
```

Thanh trạng thái đếm ngược: `💧 Đã múc: 3   Còn 8:12 tới lần múc sau`.

Hai mốc thời gian chỉnh trong ⚙ → *Chỉ múc nước*: **Chờ sau khi múc** (mặc định 615
giây = 10 phút 15 giây) và **Nhịp làm mới** (10 giây). 

### Chăm cây
#### Chọn vườn muốn đi

Bấm nút **⚙** trên bảng để mở phần cài đặt. Bảng tích chọn nằm ngay trên cùng:

```
Phạm vi chạy
                    Chế Đan   Luyện Hóa   Quý Hiếm
 Dược Viên Linh        ☐          ☑           ☑
 Dược Viên Huyền       ☐          ☑           ☑
 Dược Viên Tiên        ☐          ☐           ☐
 [Tích tất cả] [Bỏ tích]   Sẽ đi: 4 vườn trong 2 dược viên
```
- Tích ô nào thì đi vườn đó, **mỗi dược viên chọn riêng**.
- **Bỏ tích cả một hàng = bỏ qua hẳn dược viên đó.**
- Chưa tích ô nào mà bấm Chạy thì script chặn lại và tự mở bảng này.

#### Linh căn và nút AOE

- Tích `Kim` / `Mộc` / `Thủy` / `Hỏa` / `Thổ` (chọn nhiều) → bấm nút AOE ghi bất kỳ thuộc tính nào đã tích.
- AOE không hợp linh căn thì script **bỏ qua**.
- **Thiếu Kim, Thủy hoặc Thổ** → sau khi AOE xong, bot vẫn vào từng ô đất làm tay phần còn thiếu.
  **Đủ cả ba** → AOE lo hết, không cần vào từng ô.

Thứ tự ở mỗi vườn: **bắt sâu → bón phân → tưới nước**. Tưới xong mà sâu ra lại thì bắt
sâu tiếp; bón/tưới lúc đó đang cooldown nên không bấm lại.

## Cooldown từng vườn

Mỗi vườn có cooldown tưới/bón riêng (4', 4'30", 8'…) — gõ ở ⚙ → *Từng vườn*, ô để trống
thì dùng *Cooldown mặc định* (4:00). Nhận `4:30`, `4'30`, `270`.

## Hái, gieo lại và luật dừng vườn

Hạt giống ghi ở ⚙ →
*Từng vườn* → ô *Hạt giống gieo lại*, gõ một phần tên cũng được (`Linh Liên Dưỡng Hồn`).

| Tình huống | Bot làm |
|---|---|
| có ô chín, có Mộc | bấm **Thu Hoạch AOE** hái cả vườn |
| có ô chín, không Mộc | bỏ vườn khỏi vòng lặp, để người khác hái |
| trống, có Mộc, vườn có ghi **hạt giống** | bấm **Gieo Hạt AOE** → mở danh sách hạt → chọn đúng hạt đã ghi → về vườn bón/tưới cho hạt mới |
| trống, không ghi hạt giống (= hái xong rời vườn) | bỏ vườn khỏi vòng lặp |
| trống, không có Mộc | bỏ vườn khỏi vòng lặp |
| hạt giống **hết** (Còn: 0) hoặc không có trong túi | bấm Quay Lại, bỏ vườn khỏi vòng lặp |

Vườn còn cây đang lớn (dù có vài ô chín) → chăm tiếp, không hái. 

```
hái (hoặc vườn trống sẵn) → gieo hạt → bón phân → tưới nước → sang vườn khác
```

- Hái xong mà **không gieo** (vườn không ghi hạt giống, hết hạt, hay không có Mộc) → rời vườn
  ngay, **không vào từng ô**.
- **Có gieo** → gieo xong chăm cây mới như bình thường: AOE trước, thiếu linh căn thì vào từng ô.

Danh sách vườn bị loại chỉ tính trong phiên chạy; bấm `↺ Bỏ loại vườn` hoặc Dừng rồi Chạy
lại là xoá. Số vườn đã loại hiện ở thanh trạng thái.
