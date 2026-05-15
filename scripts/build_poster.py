"""Generate Instagram recruitment poster for the Gyeongju World program."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)

W = H = 1080

NANUM_B = "/usr/share/fonts/truetype/nanum/NanumSquareB.ttf"
NANUM_BOLD = "/usr/share/fonts/truetype/nanum/NanumSquareRoundB.ttf"
NANUM_R = "/usr/share/fonts/truetype/nanum/NanumSquareRoundR.ttf"
NANUM_G_B = "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


def gradient(w: int, h: int, top: tuple, bottom: tuple) -> Image.Image:
    base = Image.new("RGB", (w, h), top)
    px = base.load()
    for y in range(h):
        t = y / (h - 1)
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return base


def soft_circle(color: tuple, diameter: int, alpha: int = 255) -> Image.Image:
    img = Image.new("RGBA", (diameter, diameter), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse((0, 0, diameter, diameter),
                                fill=color + (alpha,))
    return img.filter(ImageFilter.GaussianBlur(radius=diameter / 8))


def text_centered(draw, xy, text, font_obj, fill,
                  stroke_width=0, stroke_fill=None):
    bbox = draw.textbbox((0, 0), text, font=font_obj)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = xy[0] - w / 2 - bbox[0]
    y = xy[1] - h / 2 - bbox[1]
    draw.text((x, y), text, font=font_obj, fill=fill,
              stroke_width=stroke_width, stroke_fill=stroke_fill)


def text_anchored(draw, xy, text, font_obj, fill,
                  anchor="lt", stroke_width=0, stroke_fill=None):
    draw.text(xy, text, font=font_obj, fill=fill, anchor=anchor,
              stroke_width=stroke_width, stroke_fill=stroke_fill)


def rounded_rect(draw, xy, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill,
                           outline=outline, width=width)


def shadow_text(canvas, xy, text, font_obj, fill, shadow=(0, 0, 0, 80),
                blur=6, offset=(2, 4)):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((xy[0] + offset[0], xy[1] + offset[1]), text, font=font_obj,
           fill=shadow, anchor="mm")
    layer = layer.filter(ImageFilter.GaussianBlur(radius=blur))
    canvas.alpha_composite(layer)
    d2 = ImageDraw.Draw(canvas)
    d2.text(xy, text, font=font_obj, fill=fill, anchor="mm")


def main() -> None:
    bg = gradient(W, H, (255, 110, 88), (255, 184, 76))

    decorations = [
        ((255, 232, 120), 620, (-180, -220), 200),
        ((255, 99, 164), 460, (760, -120), 180),
        ((118, 201, 255), 480, (-200, 760), 170),
        ((150, 110, 255), 380, (780, 760), 160),
        ((255, 255, 255), 220, (480, 60), 60),
    ]
    for color, dia, pos, alpha in decorations:
        circ = soft_circle(color, dia, alpha)
        bg.paste(circ, pos, circ)

    canvas = bg.convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    # Top organization tag
    tag_w, tag_h = 380, 58
    tag_x = (W - tag_w) // 2
    tag_y = 50
    rounded_rect(draw, (tag_x, tag_y, tag_x + tag_w, tag_y + tag_h),
                 radius=tag_h // 2, fill=(255, 255, 255, 240))
    text_centered(draw, (W / 2, tag_y + tag_h / 2),
                  "2026  고령군청소년문화의집",
                  font(NANUM_B, 26), (90, 40, 110))

    # Small "RECRUITING" eyebrow
    text_centered(draw, (W / 2, 150),
                  "★  체 험 활 동  참 가 자  모 집  ★",
                  font(NANUM_BOLD, 26), (255, 248, 200))

    # Hero title — shadow + outlined for pop
    shadow_text(canvas, (W / 2, 248), "우리들의 특별한 하루",
                font(NANUM_B, 78), (255, 255, 255), blur=10, offset=(3, 6))

    # "in 경주월드" featured
    draw = ImageDraw.Draw(canvas)
    bbox_in = draw.textbbox((0, 0), "in", font=font(NANUM_R, 60))
    in_w = bbox_in[2] - bbox_in[0]
    bbox_gj = draw.textbbox((0, 0), "경 주 월 드", font=font(NANUM_B, 78))
    gj_w = bbox_gj[2] - bbox_gj[0]
    gap = 28
    total = in_w + gap + gj_w
    start_x = (W - total) / 2

    draw.text((start_x, 318), "in", font=font(NANUM_R, 60),
              fill=(255, 255, 255))
    # Background highlight behind 경주월드
    hl_x1 = start_x + in_w + gap - 14
    hl_x2 = hl_x1 + gj_w + 28
    hl_y1 = 318
    hl_y2 = 318 + 92
    rounded_rect(draw, (hl_x1, hl_y1, hl_x2, hl_y2),
                 radius=18, fill=(255, 240, 110, 255))
    draw.text((start_x + in_w + gap, 322), "경 주 월 드",
              font=font(NANUM_B, 78), fill=(200, 50, 40))

    # Subtitle
    text_centered(draw, (W / 2, 458),
                  "경주월드 테마파크에서 보내는 신나는 하루!",
                  font(NANUM_BOLD, 28), (255, 255, 255))

    # Info card
    card_x1, card_y1 = 70, 498
    card_x2, card_y2 = W - 70, 880
    # Soft shadow for card
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (card_x1 + 6, card_y1 + 10, card_x2 + 6, card_y2 + 10),
        radius=32, fill=(0, 0, 0, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=12))
    canvas.alpha_composite(shadow)
    draw = ImageDraw.Draw(canvas)
    rounded_rect(draw, (card_x1, card_y1, card_x2, card_y2),
                 radius=32, fill=(255, 255, 255, 248))

    # Header tab
    hdr_h = 64
    rounded_rect(draw, (card_x1, card_y1, card_x2, card_y1 + hdr_h),
                 radius=32, fill=(220, 60, 70, 255))
    draw.rectangle(
        (card_x1, card_y1 + hdr_h - 30, card_x2, card_y1 + hdr_h),
        fill=(220, 60, 70, 255))
    text_centered(draw, ((card_x1 + card_x2) / 2, card_y1 + hdr_h / 2),
                  "PROGRAM   INFO",
                  font(NANUM_B, 30), (255, 245, 235))

    info_rows = [
        ("일  시", "2026. 06. 07 (일)   09:00 ~ 18:50"),
        ("장  소", "경주월드 테마파크"),
        ("대  상", "초등 6학년 ~ 고등 3학년"),
        ("인  원", "선착순 30명"),
    ]
    label_x = card_x1 + 50
    value_x = card_x1 + 230
    row_y = card_y1 + hdr_h + 44
    row_step = 56
    for label, value in info_rows:
        bbox = draw.textbbox((0, 0), label, font=font(NANUM_B, 24))
        pill_w = (bbox[2] - bbox[0]) + 30
        pill_h = 40
        pill_y = row_y - pill_h / 2
        rounded_rect(draw,
                     (label_x, pill_y, label_x + pill_w, pill_y + pill_h),
                     radius=pill_h // 2, fill=(255, 224, 210, 255))
        text_anchored(draw, (label_x + pill_w / 2, row_y), label,
                      font(NANUM_B, 24), (210, 70, 60), anchor="mm")
        text_anchored(draw, (value_x, row_y), value,
                      font(NANUM_B, 26), (45, 30, 65), anchor="lm")
        row_y += row_step

    # Divider + 신청기간
    div_y = row_y - row_step + 38
    draw.line((card_x1 + 50, div_y, card_x2 - 50, div_y),
              fill=(235, 220, 220), width=2)
    apply_y = div_y + 30
    # Larger emphasized 신청기간
    rounded_rect(draw, (label_x, apply_y - 22,
                        label_x + 110, apply_y + 22),
                 radius=22, fill=(255, 240, 110, 255))
    text_anchored(draw, (label_x + 55, apply_y), "신청기간",
                  font(NANUM_B, 24), (200, 50, 40), anchor="mm")
    text_anchored(draw, (value_x, apply_y - 4),
                  "05. 16 (토) 10:00  ~  05. 29 (금) 19:00",
                  font(NANUM_B, 24), (45, 30, 65), anchor="lm")
    text_anchored(draw, (value_x, apply_y + 24),
                  "※ 선착순 마감 / 일정은 상황에 따라 변동 가능",
                  font(NANUM_R, 18), (130, 110, 130), anchor="lm")

    # QR + contact panel
    panel_x1, panel_y1 = 70, 902
    panel_x2, panel_y2 = W - 70, H - 30
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (panel_x1 + 5, panel_y1 + 8, panel_x2 + 5, panel_y2 + 8),
        radius=26, fill=(0, 0, 0, 60))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=10))
    canvas.alpha_composite(shadow)
    draw = ImageDraw.Draw(canvas)
    rounded_rect(draw, (panel_x1, panel_y1, panel_x2, panel_y2),
                 radius=26, fill=(255, 255, 255, 250))

    qr = Image.open(ASSETS / "qr_only.png").convert("RGBA")
    qr_size = 130
    qr_resized = qr.resize((qr_size, qr_size), Image.LANCZOS)
    qr_x = panel_x1 + 26
    qr_y = panel_y1 + (panel_y2 - panel_y1 - qr_size) // 2
    canvas.paste(qr_resized, (qr_x, qr_y), qr_resized)

    info_x = qr_x + qr_size + 28
    text_anchored(draw, (info_x, qr_y + 4),
                  "QR로 바로 신청!",
                  font(NANUM_B, 28), (220, 60, 70), anchor="lt")
    text_anchored(draw, (info_x, qr_y + 44),
                  "Tel   956-1308     /     Fax   956-1309",
                  font(NANUM_B, 20), (60, 40, 80), anchor="lt")
    text_anchored(draw, (info_x, qr_y + 74),
                  "e-mail   1004choi@korea.kr",
                  font(NANUM_B, 20), (60, 40, 80), anchor="lt")
    text_anchored(draw, (info_x, qr_y + 104),
                  "방문   대가야 문화누리 3층  청소년문화의집",
                  font(NANUM_R, 18), (90, 70, 110), anchor="lt")

    # Footer signature
    text_centered(draw, (W / 2, H - 12),
                  "고령군청소년문화의집",
                  font(NANUM_B, 16), (255, 255, 255))

    out_path = OUT / "instagram_poster.png"
    canvas.convert("RGB").save(out_path, "PNG", optimize=True)
    print(f"Saved {out_path}")


if __name__ == "__main__":
    main()
