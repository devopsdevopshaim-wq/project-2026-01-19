import torch, sys, copy, numpy as np
from PIL import Image
from controlnet_aux import OpenposeDetector
from controlnet_aux.open_pose import draw_poses
from controlnet_aux.open_pose.body import Keypoint
from diffusers import StableDiffusionControlNetPipeline, ControlNetModel, AutoencoderKL, DPMSolverMultistepScheduler
torch.set_num_threads(4)
base_path, seed = sys.argv[1], int(sys.argv[2]); which = sys.argv[3].split(',')
base = Image.open(base_path).convert('RGB'); W,H = base.size
det = OpenposeDetector.from_pretrained("lllyasviel/Annotators")
poses = det.detect_poses(np.array(base), include_hand=False, include_face=False)
kp = list(poses[0].body.keypoints)
def P(i): return np.array([kp[i].x, kp[i].y])
rs, ls = P(2), P(5); sw = abs(ls[0]-rs[0])   # shoulder width (normalized)
def setk(i, xy): kp[i] = Keypoint(float(xy[0]), float(xy[1]))
L = sw*1.05  # upper arm length approx
G = {
 'welcome':  {3: rs+[-0.35*L, 0.9*L], 4: rs+[-0.95*L, 0.55*L], 6: ls+[0.35*L, 0.9*L], 7: ls+[0.95*L, 0.55*L]},
 'point':    {3: rs+[-0.9*L, 0.3*L], 4: rs+[-1.8*L, 0.15*L]},
 'present':  {3: rs+[-0.55*L, 0.8*L], 4: rs+[-1.35*L, 0.75*L]},
 'show':     {3: rs+[-0.6*L, 0.75*L], 4: rs+[-1.2*L, 0.35*L], 6: ls+[0.6*L, 0.75*L], 7: ls+[1.2*L, 0.35*L]},
 'wave':     {3: rs+[-0.55*L, 0.55*L], 4: rs+[-0.75*L, -0.45*L]},
 'thumbs':   {3: rs+[-0.25*L, 0.95*L], 4: rs+[0.15*L, 0.45*L]},
}
cn = ControlNetModel.from_pretrained("lllyasviel/control_v11p_sd15_openpose")
vae = AutoencoderKL.from_pretrained("stabilityai/sd-vae-ft-mse")
pipe = StableDiffusionControlNetPipeline.from_pretrained("SG161222/Realistic_Vision_V5.1_noVAE", controlnet=cn, vae=vae, safety_checker=None)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True, algorithm_type="dpmsolver++", final_sigmas_type="sigma_min")
pipe.load_ip_adapter("h94/IP-Adapter", subfolder="models", weight_name="ip-adapter-plus-face_sd15.bin")
pipe.set_ip_adapter_scale(0.65)
fx,fy=P(0)[0]*W,P(0)[1]*H; fs=int(sw*W*1.3)
face=base.crop((int(fx-fs),int(fy-fs*1.1),int(fx+fs),int(fy+fs*0.9))).resize((224,224))
face.save("v2/pose/face_ref.png")
Pr = ("RAW photo, full body shot of a friendly professional 30 year old Israeli woman standing, long wavy dark brown hair, "
     "wearing a modest long-sleeved cream silk button-up shirt fully covering her torso, neatly tucked into high-waisted beige wide-leg trousers, nude heels, smiling warmly with closed lips, "
     "looking at the camera, both hands visible and out of pockets, natural presenting gesture, plain empty light grey studio background with nothing else, soft even studio lighting, sharp focus, photorealistic, detailed hands")
N = "sofa, couch, furniture, chair, table, crop top, midriff, bare stomach, belly, cleavage, sleeveless, bra, hands in pockets, motion blur, ghost arm, cartoon, painting, 3d, cgi, deformed, extra limbs, extra arms, extra fingers, bad hands, fused fingers, bad anatomy, cropped feet, cropped head, blurry, lowres, open mouth, teeth, text, watermark, multiple people"
for name in which:
    k2 = copy.deepcopy(kp)
    for i,xy in G[name].items(): k2[i] = Keypoint(float(xy[0]), float(xy[1]))
    pr = copy.deepcopy(poses[0]); pr = pr._replace(body=pr.body._replace(keypoints=k2))
    pose_img = Image.fromarray(draw_poses([pr], H, W, draw_body=True, draw_hand=False, draw_face=False))
    pose_img.save(f"v2/pose/skel_{name}.png")
    g = torch.Generator().manual_seed(seed)
    im = pipe(Pr, negative_prompt=N, image=pose_img, ip_adapter_image=face, width=W, height=H,
              num_inference_steps=28, guidance_scale=6.0, controlnet_conditioning_scale=1.0, generator=g).images[0]
    im.save(f"v2/pose/pose_{name}.png"); print("saved", name, flush=True)
