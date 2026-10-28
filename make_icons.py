from PIL import Image, ImageDraw, ImageFont

ACCENT = (42, 157, 143)
WHITE = (255, 255, 255)
FONT_PATH = "C:/Windows/Fonts/malgun.ttf"

def make_icon(size, path, radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(size * radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=ACCENT)

    font_size = int(size * 0.34)
    font = ImageFont.truetype(FONT_PATH, font_size)
    text = "미룸"
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = (size - w) / 2 - bbox[0]
    y = (size - h) / 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=WHITE)

    img.save(path)
    print(f"saved {path} ({size}x{size})")

make_icon(192, "icon-192.png")
make_icon(512, "icon-512.png")
make_icon(180, "apple-touch-icon.png", radius_ratio=0.0)
