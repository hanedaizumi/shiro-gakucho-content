import sys
import re

def count_chars(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            text = f.read()

        # 空白（全角・半角）と改行を完全に削除
        text = re.sub(r'[\s\u3000]+', '', text)

        # Markdownの記号（# * - > ! [ ] ( ) ` _ ~ = + 等）を削除
        text = re.sub(r'[#\*\-\>!\[\]\(\)`_~=\+]', '', text)

        count = len(text)
        print(f"\n=====================================")
        print(f"【計測完了】正味文字数：{count} 文字")
        print(f"目標: 10,000〜15,000 文字（25〜30分動画）")
        if count < 10000:
            print(f"⚠️  不足: あと約 {10000 - count} 文字の加筆が必要です")
        elif count > 15000:
            print(f"⚠️  超過: 約 {count - 15000} 文字の圧縮が必要です")
        else:
            print(f"✅  文字数OK！台本出力・レビューへ進んでください")
        print(f"=====================================\n")

    except FileNotFoundError:
        print(f"エラー: {file_path} が見つかりません。")
    except Exception as e:
        print(f"エラーが発生しました: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("使い方: python count.py <台本ファイル.md>")
    else:
        count_chars(sys.argv[1])
