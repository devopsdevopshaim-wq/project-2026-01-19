"""Builds EchoMimicV2_Hebrew_Presenter.ipynb with the presenter image + fallback voice lines embedded."""
import base64, json, sys

ref_jpg, out_path = sys.argv[1], sys.argv[2]
voice_mp3s = sys.argv[3:8]
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()

LINES = [
    "שלום! מתכננים ברית, בר מצווה, או אירוע משפחתי? יש לנו חבילה שתשאיר לכם את האירוע... לתמיד.",
    "בחבילה תקבלו מגנטים טריים ואיכותיים, ללא הגבלה, לאורך כל האירוע. כל אורח חוזר הביתה עם מזכרת.",
    "צלם סטילס מקצועי מלווה אתכם לאורך כל האירוע: צילומי יום מסודרים, וגם רגעים ספונטניים ואמיתיים.",
    "ורוצים להוסיף קיר צילום מעוצב, בהתאמה אישית לאירוע שלכם? אפשר! ובמחיר לכל כיס.",
    "הכל בחבילה אחת. שלחו לנו הודעה, ותשריינו את התאריך שלכם כבר היום!",
]

def md(s): return {"cell_type": "markdown", "metadata": {}, "source": s}
def code(s): return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s}

cells = [
md("""# 🎬 מגישה מדברת בעברית – עם ידיים ותנועות גוף (חינם, Google Colab)

<div dir="rtl">

**מה המחברת עושה:** מייצרת 5 קטעי וידאו של המגישה מדברת את תסריט הפרסומת, עם **תנועות ידיים, גוף וסנכרון שפתיים**, באמצעות המודל הפתוח **EchoMimicV2** (Ant Group, רישיון Apache‑2.0).

**לפני שמתחילים (חד פעמי):**
1. בתפריט למעלה: **Runtime → Change runtime type → T4 GPU → Save** (חינם).
2. (מומלץ, לקול אנושי יותר) מפתח Gemini: נכנסים ל‑https://aistudio.google.com/apikey → Create API key. במחברת: לוחצים על אייקון המפתח 🔑 בצד שמאל → **Add new secret** → שם: `GEMINI_API_KEY`, ערך: המפתח → מסמנים *Notebook access*. המפתח נשאר אצלך ב‑Colab ולא נשלח לאף אחד.
   - בלי מפתח – המחברת תשתמש בקול הגיבוי (הקול הקודם).

**הרצה:** **Runtime → Run all**, ומחכים (בערך 40–60 דקות). בסוף יירד אליך קובץ `presenter_clips.zip` – שלח אותו אליי ואני אשלב אותו בפרסומת.

</div>"""),
code("""#@title 1️⃣ בדיקת GPU
!nvidia-smi --query-gpu=name,memory.total --format=csv || echo "⚠️ אין GPU – בחר Runtime > Change runtime type > T4 GPU"
"""),
code("""#@title 2️⃣ התקנה והורדת המודלים (~10 דק')
%cd /content
!git clone -q https://github.com/antgroup/echomimic_v2 || true
%cd /content/echomimic_v2
!pip -q install diffusers==0.31.0 "transformers>=4.46.3" accelerate einops==0.8.0 omegaconf==2.3.0 moviepy==1.0.3 imageio imageio-ffmpeg av opencv-python tiktoken more-itertools google-genai soundfile
from huggingface_hub import snapshot_download, hf_hub_download
import os, urllib.request
W='/content/echomimic_v2/pretrained_weights'
snapshot_download('BadToBest/EchoMimicV2', local_dir=W, allow_patterns=['denoising_unet_acc.pth','motion_module_acc.pth','pose_encoder.pth','reference_unet.pth'])
snapshot_download('stabilityai/sd-vae-ft-mse', local_dir=f'{W}/sd-vae-ft-mse', allow_patterns=['*.json','*.safetensors'])
snapshot_download('lambdalabs/sd-image-variations-diffusers', local_dir=f'{W}/sd-image-variations-diffusers', allow_patterns=['*.json','unet/*.bin','unet/*.json','image_encoder/*','feature_extractor/*'])
os.makedirs(f'{W}/audio_processor', exist_ok=True)
if not os.path.exists(f'{W}/audio_processor/tiny.pt'):
    urllib.request.urlretrieve('https://openaipublic.azureedge.net/main/whisper/models/65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9/tiny.pt', f'{W}/audio_processor/tiny.pt')
os.environ['FFMPEG_PATH'] = '/usr/bin'
print('✅ ready')
"""),
code(f"""#@title 3️⃣ תמונת המגישה + קול גיבוי (מוטמעים במחברת)
import base64, os
os.makedirs('/content/job', exist_ok=True)
open('/content/job/presenter.jpg','wb').write(base64.b64decode('{b64(ref_jpg)}'))
FALLBACK = {json.dumps([b64(p) for p in voice_mp3s])}
for i, b in enumerate(FALLBACK, 1):
    open(f'/content/job/fallback_{{i}}.mp3','wb').write(base64.b64decode(b))
from IPython.display import Image, display; display(Image('/content/job/presenter.jpg', width=360))
"""),
code(f"""#@title 4️⃣ קול עברי טבעי עם Gemini TTS (אם הגדרת GEMINI_API_KEY)
LINES = {json.dumps(LINES, ensure_ascii=False)}
STYLE = "קראי בעברית טבעית וברורה, כמו מגישה ישראלית מקצועית בפרסומת: חמה, מחייכת, נלהבת, בקצב רגוע ובהגייה מדויקת:"   #@param {{type:"string"}}
VOICE = "Kore"  #@param ["Kore", "Aoede", "Leda", "Zephyr", "Callirrhoe", "Despina"]
import wave, subprocess, os
key = None
try:
    from google.colab import userdata
    key = userdata.get('GEMINI_API_KEY')
except Exception as e:
    print('אין מפתח Gemini – משתמש בקול הגיבוי.')
used = 'fallback'
if key:
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=key)
    MODELS = ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts']
    for model in MODELS:
        try:
            for i, line in enumerate(LINES, 1):
                r = client.models.generate_content(model=model, contents=f"{{STYLE}}\\n{{line}}",
                    config=types.GenerateContentConfig(response_modalities=['AUDIO'],
                        speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE)))))
                pcm = r.candidates[0].content.parts[0].inline_data.data
                with wave.open(f'/content/job/gem_{{i}}.wav','wb') as w:
                    w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm)
            used = model; break
        except Exception as e:
            print(model, '→', str(e)[:200])
for i in range(1, 6):
    src = f'/content/job/gem_{{i}}.wav' if used != 'fallback' else f'/content/job/fallback_{{i}}.mp3'
    subprocess.run(['ffmpeg','-loglevel','error','-y','-i',src,'-af','silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse','-ar','16000','-ac','1',f'/content/job/line_{{i}}.wav'], check=True)
print('🎙️ voice:', used)
from IPython.display import Audio, display
for i in range(1, 6): display(Audio(f'/content/job/line_{{i}}.wav'))
"""),
code("""#@title 5️⃣ יצירת המגישה המדברת עם ידיים (הארוך – ~30-50 דק')
import yaml, shutil, glob, subprocess, os
from PIL import Image
%cd /content/echomimic_v2
POSES = ['01', '02', '03', '04', '01']      # תנועות ידיים שונות לכל משפט
cases = {}
for i in range(1, 6):
    ref = f'/content/job/ref_{i}.png'
    Image.open('/content/job/presenter.jpg').convert('RGB').resize((768,768)).save(ref)
    cases[ref] = [f'/content/job/line_{i}.wav', f'./assets/halfbody_demo/pose/{POSES[i-1]}/']
cfg = yaml.safe_load(open('configs/prompts/infer_acc.yaml'))
cfg['test_cases'] = cases
yaml.safe_dump(cfg, open('/content/job/infer_he.yaml','w'), allow_unicode=True)
!python infer_acc.py --config /content/job/infer_he.yaml -W 768 -H 768 -L 330 --steps 6 --fps 24 --seed 420
outs = sorted(glob.glob('output/**/*_sig.mp4', recursive=True))
print('\\n'.join(outs))
"""),
code("""#@title 6️⃣ הורדת התוצאה – שלח לי את presenter_clips.zip
import zipfile, glob, os
from google.colab import files
with zipfile.ZipFile('/content/presenter_clips.zip','w') as z:
    for p in sorted(glob.glob('/content/echomimic_v2/output/**/*_sig.mp4', recursive=True)):
        z.write(p, os.path.basename(p))
    for p in sorted(glob.glob('/content/job/line_*.wav')):
        z.write(p, os.path.basename(p))
files.download('/content/presenter_clips.zip')
"""),
]
nb = {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"provenance": [], "gpuType": "T4"},
      "kernelspec": {"name": "python3", "display_name": "Python 3"}, "language_info": {"name": "python"}},
      "nbformat": 4, "nbformat_minor": 0}
json.dump(nb, open(out_path, 'w'), ensure_ascii=False, indent=1)
print('notebook written', out_path)
