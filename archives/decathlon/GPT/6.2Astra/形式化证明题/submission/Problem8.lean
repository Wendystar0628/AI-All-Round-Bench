import Mathlib.Combinatorics.Additive.ErdosGinzburgZiv
import Mathlib.Data.Nat.Choose.Lucas
import Mathlib.Algebra.MvPolynomial.CommRing
import Mathlib.Algebra.BigOperators.Group.Finset.Powerset
import Mathlib.Tactic

open Finset MvPolynomial
namespace Kemnitz
variable {ι : Type*} [DecidableEq ι] {p : ℕ} [Fact p.Prime]
private def bit (t : Finset ι) (i : ι) : ZMod p := if i ∈ t then 1 else 0

private lemma cube (s : Finset ι) (P : MvPolynomial ι (ZMod p)) (h : P.totalDegree < s.card) :
    ∑ t ∈ s.powerset, (-1)^t.card * eval (bit t) P = 0 := by
  classical
  conv_lhs => congr; rfl; ext t; rhs; rhs; rw [P.as_sum]
  simp_rw [map_sum,mul_sum]
  rw [sum_comm]
  apply sum_eq_zero
  intro d hd
  have H : d.support.card ≤ d.sum (fun _ e => e) := by
    calc
      _ = ∑ _i ∈ d.support,1 := by simp
      _ ≤ _ := sum_le_sum (fun i hi => Nat.one_le_iff_ne_zero.mpr (Finsupp.mem_support_iff.mp hi))
  obtain ⟨i,hi,hn⟩ := not_subset.mp (show ¬ s ⊆ d.support by
    intro hh; have := card_le_card hh; have := le_totalDegree hd; omega)
  nth_rw 1 [← insert_erase hi]
  rw [sum_powerset_insert (notMem_erase _ _), ← sum_add_distrib]
  apply sum_eq_zero
  intro t ht
  have hit : i ∉ t := notMem_mono (mem_powerset.mp ht) (notMem_erase _ _)
  have he : eval (bit (insert i t)) (monomial d (P.coeff d)) = eval (bit t) (monomial d (P.coeff d)) := by
    simp only [eval_monomial,Finsupp.prod]
    congr 1
    apply prod_congr rfl
    intro j hj
    simp [bit,ne_of_mem_of_not_mem hj hn]
  rw [he,card_insert_of_notMem hit,pow_succ]; ring

private def good (f : ι → ZMod p × ZMod p) (s : Finset ι) (k : ℕ) :=
  (s.powersetCard k).filter (fun t => ∑ i ∈ t,f i = 0)
private def N (f : ι → ZMod p × ZMod p) (s : Finset ι) (k : ℕ) : ZMod p := (good f s k).card
private lemma mg {f : ι → ZMod p × ZMod p} {s t : Finset ι} {k : ℕ} :
    t ∈ good f s k ↔ t ⊆ s ∧ t.card=k ∧ ∑ i ∈ t,f i=0 := by simp [good,and_assoc]
private lemma zeroN (f : ι → ZMod p × ZMod p) (s : Finset ι) : N f s 0 = 1 := by simp [N,good,filter_singleton]
private lemma bigN (f : ι → ZMod p × ZMod p) (s : Finset ι) {k : ℕ} (h : s.card < k) : N f s k = 0 := by
  simp [N,good,powersetCard_eq_empty.mpr h]
private noncomputable def countForm (f : ι → ZMod p × ZMod p) (s : Finset ι) (w : ℕ → ZMod p) :=
  ∑ t ∈ s.powerset, if ∑ i ∈ t,f i = 0 then w t.card else 0

private lemma layer (f : ι → ZMod p × ZMod p) (s : Finset ι) (k : ℕ) :
    countForm f s (fun b => if b=k then 1 else 0) = N f s k := by
  classical
  simp only [countForm,← ite_and, sum_boole,N]
  congr 1
  congr 1
  ext t; simp [good,and_comm,and_left_comm,and_assoc]

private def v0 (p k : ℕ) : ZMod p := if p ∣ k then (-1)^k else 0
private def v1 (p k : ℕ) : ZMod p := if p ∣ k+1 then (-1)^k else 0
private lemma profile (f : ι → ZMod p × ZMod p) (s : Finset ι) (hp : 2 < p) (hs : s.card ≤ 4*p-3) :
    countForm f s (v0 p) = 1-N f s p+N f s (2*p)-N f s (3*p) ∧
    countForm f s (v1 p) = N f s (p-1)-N f s (2*p-1)+N f s (3*p-1) := by
  classical
  let b (j k : ℕ) : ZMod p := if k=j then 1 else 0
  have H (j : ℕ) : N f s j = countForm f s (b j) := (layer f s j).symm
  rw [← zeroN f s,H 0,H p,H (2*p),H (3*p),H (p-1),H (2*p-1),H (3*p-1)]
  have odd := (Fact.out : p.Prime).odd_of_ne_two (by omega)
  have minus : (-1 : ZMod p)^p = -1 := odd.neg_one_pow
  have sign (j) (hj : 0 < j) : (-1 : ZMod p)^(j*p-1) = -((-1)^j) := by
    have he : j*p-1+1=j*p := Nat.sub_add_cancel (Nat.mul_pos hj (by omega))
    have HH := congrArg (fun i : ℕ => (-1 : ZMod p)^i) he
    simp only [pow_succ,Nat.mul_comm j p,pow_mul,minus] at HH
    rw [Nat.mul_comm j p]
    linear_combination -HH
  simp only [countForm,← sum_sub_distrib,← sum_add_distrib]
  constructor <;> apply sum_congr rfl <;> intro t ht
  all_goals
    have ht' := card_le_card (mem_powerset.mp ht)
    by_cases h : ∑ i ∈ t,f i=0
    swap; · simp [h]
    simp only [h,ite_true]
  · unfold v0
    split_ifs with hh
    · obtain ⟨j,hj⟩ := hh
      have H : j < 4 := by by_contra! H; have := Nat.mul_le_mul_left p H; omega
      interval_cases j <;> simp [hj,b,pow_mul,minus,show p ≠ 0 by omega] <;> split_ifs <;> first | omega | ring
    · have h0 : t.card ≠ 0 := fun h => hh (h ▸ dvd_zero _)
      have h1 : t.card ≠ p := fun h => hh (h ▸ dvd_rfl)
      have h2 : t.card ≠ 2*p := fun h => hh (h ▸ dvd_mul_left ..)
      have h3 : t.card ≠ 3*p := fun h => hh (h ▸ dvd_mul_left ..)
      simp [b,h0,h1,h2,h3]
  · unfold v1
    split_ifs with hh
    · obtain ⟨j,hj⟩ := hh
      have H : j < 4 := by by_contra! H; have := Nat.mul_le_mul_left p H; omega
      have H' : 0 < j := by by_contra! H; simp [Nat.eq_zero_of_le_zero H] at hj
      have hj' : t.card = j*p-1 := by rw [Nat.mul_comm] at hj; omega
      rw [hj',sign j H']
      interval_cases j <;> norm_num [b] <;> split_ifs <;> first | omega | ring
    · have H (j) (hj : 0 < j) : t.card ≠ j*p-1 := by
        intro he
        apply hh
        rw [he,Nat.sub_add_cancel (Nat.mul_pos hj (by omega))]
        exact dvd_mul_left ..
      simp [b,by simpa using H 1 (by decide),H 2 (by decide),H 3 (by decide)]

private noncomputable def lin (s : Finset ι) (a : ι → ZMod p) : MvPolynomial ι (ZMod p) :=
  ∑ i ∈ s, C (a i)*X i
private lemma degLin (s : Finset ι) (a : ι → ZMod p) : (lin s a).totalDegree ≤ 1 := by
  apply totalDegree_finsetSum_le
  intro i hi
  exact (totalDegree_mul ..).trans (by simp)
private lemma evalLin (s t : Finset ι) (h : t ⊆ s) (a : ι → ZMod p) :
    eval (bit t) (lin s a) = ∑ i ∈ t, a i := by
  simp [lin,bit,mul_ite,← sum_filter,Finset.filter_mem_eq_inter,inter_eq_right.mpr h]
private lemma equations (f : ι → ZMod p × ZMod p) (s : Finset ι) (hp : 2 < p) :
    (3*(p-1) < s.card → countForm f s (v0 p)=0 ∧ countForm f s (v1 p)=0) ∧
    (3*(p-1) ≤ s.card → countForm f s (v0 p)-countForm f s (v1 p)=0) := by
  classical
  let L := lin s (fun _ => (1:ZMod p))
  let W (A : MvPolynomial ι (ZMod p)) := 1-A^(p-1)
  let Q := W (lin s (fun i => (f i).1)) * W (lin s (fun i => (f i).2))
  have hW A (hA : totalDegree A ≤ 1) : (W A).totalDegree ≤ p-1 := by
    apply (totalDegree_sub ..).trans
    apply max_le (by simp)
    exact (totalDegree_pow ..).trans (by simpa using Nat.mul_le_mul_left (p-1) hA)
  have hQ : Q.totalDegree ≤ 2*(p-1) := (totalDegree_mul ..).trans (by
    have := hW _ (degLin s (fun i => (f i).1)); have := hW _ (degLin s (fun i => (f i).2)); omega)
  have hL := degLin s (fun _ => (1:ZMod p))
  have hL' : (L+1).totalDegree ≤ 1 := (totalDegree_add ..).trans (max_le hL (by simp))
  have evalW (A : MvPolynomial ι (ZMod p)) (t) : eval (bit t) (W A) = if eval (bit t) A=0 then 1 else 0 := by
    simp [W,ZMod.pow_card_sub_one]; split_ifs <;> simp_all
  have evQ t (ht : t ⊆ s) : eval (bit t) Q = if (∑ i ∈ t,f i)=0 then 1 else 0 := by
    rw [show Q = _ from rfl,map_mul,evalW,evalW,evalLin _ _ ht,evalLin _ _ ht]
    simp [Prod.ext_iff,Prod.fst_sum,Prod.snd_sum,ite_and] <;> split_ifs <;> simp_all
  have ev (j : ℕ) (t) (ht : t ⊆ s) : eval (bit t) (W (L+C (j : ZMod p))) =
      if p ∣ t.card+j then 1 else 0 := by
    simp [evalW,L,evalLin _ _ ht,← Nat.cast_add,ZMod.natCast_eq_zero_iff]
  have H (j : ℕ) : (∑ t ∈ s.powerset, (-1)^t.card * eval (bit t) (Q*W (L+C (j:ZMod p)))) =
      countForm f s (fun k => if p ∣ k+j then (-1)^k else 0) := by
    apply sum_congr rfl
    intro t ht
    rw [map_mul,evQ t (mem_powerset.mp ht),ev j t (mem_powerset.mp ht)]
    split_ifs <;> simp_all
  have H0 := H 0
  have H1 := H 1
  simp only [Nat.cast_zero,map_zero,add_zero] at H0
  simp only [Nat.cast_one,map_one] at H1
  have hmain (A : MvPolynomial ι (ZMod p)) (hA : A.totalDegree ≤ p-1) : (Q*A).totalDegree ≤ 3*(p-1) :=
    (totalDegree_mul ..).trans (by omega)
  constructor
  · intro hs
    exact ⟨H0.symm.trans (cube _ _ ((hmain _ (hW _ hL)).trans_lt hs)),
      H1.symm.trans (cube _ _ ((hmain _ (hW _ hL')).trans_lt hs))⟩
  intro hs
  unfold v0 v1
  rw [← H0,← H1,← sum_sub_distrib]
  have hdeg : (W L-W (L+1)).totalDegree ≤ p-2 := by
    have he : W L-W (L+1) = ∑ i ∈ range (p-1), L^i*C (((p-1).choose i : ℕ) : ZMod p) := by
      simp [W,add_pow,sum_range_succ]
    rw [he]
    apply totalDegree_finsetSum_le
    intro i hi
    apply (totalDegree_mul ..).trans
    rw [totalDegree_C,add_zero]
    apply (totalDegree_pow ..).trans
    have := Nat.mul_le_mul_left i (show L.totalDegree ≤ 1 from hL)
    have := mem_range.mp hi; omega
  convert cube s (Q*(W L-W (L+1))) ((totalDegree_mul ..).trans_lt (by omega)) using 1
  apply sum_congr rfl
  intro t ht
  simp only [map_mul,map_sub]; ring

private lemma partitionCount (f : ι → ZMod p × ZMod p) (X : Finset ι) (a c : ℕ) :
    (∑ A ∈ good f X a,N f (X \ A) c) = ∑ T ∈ good f X (a+c), N f T c := by
  classical
  let L := (good f X a).sigma (fun A => good f (X \ A) c)
  let R := (good f X (a+c)).sigma (fun T => good f T c)
  let F : (Σ _ : Finset ι, Finset ι) → (Σ _ : Finset ι, Finset ι) := fun v => ⟨v.1 ∪ v.2,v.2⟩
  let G : (Σ _ : Finset ι, Finset ι) → (Σ _ : Finset ι, Finset ι) := fun v => ⟨v.1 \ v.2,v.2⟩
  have H : L.card = R.card := by
    apply card_nbij' F G
    · rintro ⟨A,C⟩ h
      obtain ⟨⟨ha,ha',ha0⟩,⟨hc,hc',hc0⟩⟩ := (by simpa [L,mg] using h :
        (A ⊆ X ∧ A.card=a ∧ ∑ i ∈ A,f i=0) ∧ (C ⊆ X \ A ∧ C.card=c ∧ ∑ i ∈ C,f i=0))
      have hd := (subset_sdiff.mp hc).2.symm
      apply mem_sigma.mpr
      exact ⟨mg.mpr ⟨union_subset ha (hc.trans sdiff_subset), by rw [card_union_of_disjoint hd,ha',hc'],
        by rw [sum_union hd,ha0,hc0,add_zero]⟩,mg.mpr ⟨subset_union_right,hc',hc0⟩⟩
    · rintro ⟨T,C⟩ h
      obtain ⟨ht,hc⟩ := mem_sigma.mp h
      obtain ⟨ht,ht',ht0⟩ := mg.mp ht
      obtain ⟨hc,hc',hc0⟩ := mg.mp hc
      have hh := sum_sdiff hc (f := f)
      apply mem_sigma.mpr
      exact ⟨mg.mpr ⟨sdiff_subset.trans ht,by rw [card_sdiff_of_subset hc,ht',hc']; omega,
        by simpa [ht0,hc0] using hh⟩,mg.mpr ⟨subset_sdiff.mpr ⟨hc.trans ht,sdiff_disjoint.symm⟩,hc',hc0⟩⟩
    · rintro ⟨A,C⟩ h
      have H := (subset_sdiff.mp (mg.mp (mem_sigma.mp h).2).1).2.symm
      simp [F,G,union_sdiff_cancel_right H]
    · rintro ⟨T,C⟩ h
      simp [F,G,sdiff_union_of_subset (mg.mp (mem_sigma.mp h).2).1]
  simpa only [L,R,card_sigma,N,Nat.cast_sum] using congrArg (fun n : ℕ => (n : ZMod p)) H

private lemma liftCount (f : ι → ZMod p × ZMod p) (X : Finset ι) {k m : ℕ} (hkm : k ≤ m) :
    (∑ s ∈ X.powersetCard m, N f s k) = ((X.card-k).choose (m-k) : ZMod p)*N f X k := by
  classical
  have he (s) (hs : s ∈ X.powersetCard m) : good f s k = (good f X k).filter (· ⊆ s) := by
    ext t
    simp only [mem_filter,mg]
    have := (mem_powersetCard.mp hs).1
    exact ⟨fun ⟨ht,hk,hz⟩ => ⟨⟨ht.trans this,hk,hz⟩,ht⟩,fun ⟨⟨_,hk,hz⟩,ht⟩ => ⟨ht,hk,hz⟩⟩
  calc
    _ = ∑ s ∈ X.powersetCard m, ∑ t ∈ good f X k, (if t ⊆ s then 1 else 0 : ZMod p) :=
      sum_congr rfl fun s hs => by simp [N,he s hs]
    _ = _ := by
      rw [sum_comm]
      simp_rw [sum_boole]
      rw [sum_congr rfl (fun t ht => by
        have h := mg.mp ht
        rw [card_filter_powersetCard_subset t X m h.1 (h.2.1 ▸ hkm),h.2.1])]
      simp [N,mul_comm]

private lemma lucasP (a : ℕ) : ((a.choose p : ℕ) : ZMod p) = (a/p : ℕ) := by
  apply (ZMod.natCast_eq_natCast_iff ..).mpr
  simpa [Nat.div_self (Fact.out : p.Prime).pos] using (Choose.choose_modEq_choose_mod_mul_choose_div_nat (n := a) (k := p) (p := p))

private lemma primeCase (f : ι → ZMod p × ZMod p) (X : Finset ι) (hX : X.card=4*p-3) :
    ∃ t ⊆ X, t.card=p ∧ ∑ i ∈ t,f i=0 := by
  classical
  have hp' := (Fact.out : p.Prime).two_le
  by_cases hp2 : p=2
  · subst p
    obtain ⟨i,hi,j,hj,hne,he⟩ := exists_ne_map_eq_of_card_lt_of_maps_to
      (s := X) (t := univ) (by simp [ZMod.card,hX]) (f := f) (fun _ _ => mem_univ _)
    exact ⟨{i,j},insert_subset hi (singleton_subset_iff.mpr hj),by simp [hne],by simp [hne,he,ZModModule.add_self]⟩
  have hp : 2 < p := by omega
  by_contra! hn
  have noP {s} (hs : s ⊆ X) : good f s p = ∅ := by
    apply eq_empty_iff_forall_notMem.mpr
    intro t ht
    obtain ⟨ht,hc,hz⟩ := mg.mp ht
    exact hn t (ht.trans hs) hc hz
  have nzP {s} (hs : s ⊆ X) : N f s p=0 := by simp [N,noP hs]
  have mid (s : Finset ι) (hs : s ⊆ X) (hlo : 3*p-2 ≤ s.card) (hhi : s.card < 3*p) :
      N f s (2*p) = -1 := by
    have H := (profile f s hp ((card_le_card hs).trans hX.le)).1
    rw [((equations f s hp).1 (by omega)).1,nzP hs,bigN f s hhi] at H
    linear_combination -H
  have no3 : good f X (3*p) = ∅ := by
    apply eq_empty_iff_forall_notMem.mpr
    intro T hT
    obtain ⟨ht,ht',ht0⟩ := mg.mp hT
    obtain ⟨u,hu⟩ := card_pos.mp (show 0 < T.card by omega)
    have hm := mid (T.erase u) ((erase_subset u T).trans ht) (by rw [card_erase_of_mem hu]; omega) (by rw [card_erase_of_mem hu]; omega)
    obtain ⟨C,hC⟩ : (good f (T.erase u) (2*p)).Nonempty := by
      by_contra! h
      simp [N,h] at hm
    obtain ⟨hc,hc',hc0⟩ := mg.mp hC
    have hct := hc.trans (erase_subset u T)
    exact hn (T \ C) (sdiff_subset.trans ht) (by rw [card_sdiff_of_subset hct,ht',hc']; omega)
      (by simpa [hc0,ht0] using sum_sdiff hct (f := f))
  have hn3 : N f X (3*p) = 0 := by simp [N,no3]
  have ha := (equations f X hp).1 (by omega)
  have hpro := profile f X hp hX.le
  have h2 : N f X (2*p) = -1 := by
    have H := hpro.1; rw [ha.1,nzP Subset.rfl,hn3] at H
    linear_combination -H
  have hrel : N f X (p-1) = N f X (3*p-1) := by
    have H := partitionCount f X (p-1) (2*p)
    rw [show p-1+2*p=3*p-1 by omega] at H
    rw [sum_congr rfl (fun A ha => mid (X \ A) sdiff_subset
      (by rw [card_sdiff_of_subset (mg.mp ha).1,(mg.mp ha).2.1]; omega)
      (by rw [card_sdiff_of_subset (mg.mp ha).1,(mg.mp ha).2.1]; omega)),
      sum_congr rfl (fun T ht => mid T (mg.mp ht).1 (by rw [(mg.mp ht).2.1]; omega)
        (by rw [(mg.mp ht).2.1]; omega))] at H
    simpa [N] using H
  have small (s) (hs : s ∈ X.powersetCard (3*p-3)) :
      1 - N f s (p-1) + N f s (2*p-1) + N f s (2*p) = 0 := by
    obtain ⟨hs,hc⟩ := mem_powersetCard.mp hs
    have h := (equations f s hp).2 (by omega)
    obtain ⟨h1,h2⟩ := profile f s hp (by omega)
    rw [h1,h2,nzP hs,bigN f s (k := 3*p-1) (by omega),bigN f s (k := 3*p) (by omega)] at h
    linear_combination h
  have H := sum_eq_zero small
  simp only [sum_sub_distrib,sum_add_distrib,sum_const,nsmul_eq_mul,mul_one,card_powersetCard,
    liftCount f X (show p-1 ≤ 3*p-3 by omega),liftCount f X (show 2*p-1 ≤ 3*p-3 by omega),
    liftCount f X (show 2*p ≤ 3*p-3 by omega)] at H
  rw [hX] at H
  have comp (k : ℕ) (hk : k ≤ 3*p-3) :
      (((4*p-3-k).choose (3*p-3-k) : ℕ) : ZMod p) = ((4*p-3-k)/p : ℕ) := by
    rw [Nat.choose_symm_of_eq_add (show 4*p-3-k = (3*p-3-k)+p by omega),lucasP]
  have empty := comp 0 (by omega)
  simp only [Nat.sub_zero] at empty
  rw [empty,comp (p-1) (by omega),comp (2*p-1) (by omega),comp (2*p) (by omega)] at H
  have d0 : (4*p-3)/p = 3 := (Nat.div_eq_iff (by omega)).mpr ⟨by omega,by omega⟩
  have d1 : (4*p-3-(p-1))/p = 2 := (Nat.div_eq_iff (by omega)).mpr ⟨by omega,by omega⟩
  have d2 : (4*p-3-(2*p-1))/p = 1 := (Nat.div_eq_iff (by omega)).mpr ⟨by omega,by omega⟩
  have d3 : (4*p-3-2*p)/p = 1 := (Nat.div_eq_iff (by omega)).mpr ⟨by omega,by omega⟩
  rw [d0,d1,d2,d3,h2] at H
  have H' := hpro.2
  rw [ha.2,← hrel] at H'
  have hbad : (2 : ZMod p) = 0 := by push_cast at H; linear_combination H - H'
  exact Nat.not_dvd_of_pos_of_lt (by decide) hp ((ZMod.natCast_eq_zero_iff 2 p).mp hbad)

private lemma remainingSize {total used blocks rest n m : ℕ} (hn : 2 ≤ n)
    (hs : 4*(m*n)-3 ≤ total) (hu : used ≤ blocks*n)
    (hb : blocks*n + 4*n ≤ 4*(m*n)) (hr : total-used ≤ rest) : 4*n-3 ≤ rest := by
  omega

private lemma integerCase (n : ℕ) {s : Finset ι} (a : ι → Fin 2 → ℤ) (hs : 4*n-3 ≤ s.card) :
    ∃ t ⊆ s, t.card=n ∧ ∀ j, (n:ℤ) ∣ ∑ i ∈ t,a i j := by
  classical
  induction n using Nat.prime_composite_induction generalizing ι with
  | zero => exact ⟨∅,by simp⟩
  | one =>
    obtain ⟨t,ht,ht'⟩ := exists_subset_card_eq (show 1 ≤ s.card by omega)
    exact ⟨t,ht,ht',by simp⟩
  | prime p hp =>
    haveI : Fact p.Prime := ⟨hp⟩
    obtain ⟨X,hX,he⟩ := exists_subset_card_eq hs
    obtain ⟨t,ht,hc,hz⟩ := primeCase (fun i => ((a i 0 : ZMod p),(a i 1 : ZMod p))) X he
    refine ⟨t,ht.trans hX,hc,?_⟩
    intro j
    fin_cases j
    · exact (ZMod.intCast_zmod_eq_zero_iff_dvd ..).mp (by simpa [Prod.fst_sum] using congrArg Prod.fst hz)
    · exact (ZMod.intCast_zmod_eq_zero_iff_dvd ..).mp (by simpa [Prod.snd_sum] using congrArg Prod.snd hz)
  | composite m hm ihm n hn ihn =>
    suffices ∀ k ≤ 4*m-3, ∃ A : Finset (Finset ι), A.card=k ∧
        (A : Set (Finset ι)).Pairwise Disjoint ∧
        ∀ t ∈ A, t ⊆ s ∧ t.card=n ∧ ∀ j, (n:ℤ) ∣ ∑ i ∈ t,a i j by
      obtain ⟨A,hcard,hdis,hA⟩ := this _ le_rfl
      obtain ⟨B,hB,hc,hdiv⟩ := ihm (fun t j => (∑ i ∈ t,a i j)/n) hcard.ge
      refine ⟨B.biUnion (fun x => x),biUnion_subset.mpr (fun t ht => (hA t (hB ht)).1),?_,?_⟩
      · rw [card_biUnion (hdis.mono hB),sum_const_nat (fun t ht => (hA t (hB ht)).2.1),hc]
      intro j
      rw [sum_biUnion (hdis.mono hB),Int.natCast_mul,mul_comm,← Int.dvd_div_iff_mul_dvd,
        Int.sum_div]
      · exact hdiv j
      · exact fun t ht => (hA _ (hB ht)).2.2 j
      · exact Finset.dvd_sum fun t ht => (hA _ (hB ht)).2.2 j
    intro k hk
    induction k with
    | zero => exact ⟨∅,by simp⟩
    | succ k ih =>
      obtain ⟨A,hc,hd,hA⟩ := ih (by omega)
      have hb : 4*n-3 ≤ (s \ A.biUnion id).card := by
        have H : (A.biUnion id).card ≤ k*n := by
          apply card_biUnion_le.trans
          simp only [id_eq]
          rw [sum_const_nat (fun t ht => (hA t ht).2.1),hc]
        have HK : k+4 ≤ 4*m := by omega
        have H' := Nat.mul_le_mul_right n HK
        rw [Nat.add_mul,Nat.mul_assoc] at H'
        exact remainingSize hn hs H H' (le_card_sdiff _ _)
      obtain ⟨u,hu,huc,huz⟩ := ihn a hb
      have hnew : u ∉ A := by
        intro h
        have hh := sdiff_disjoint.mono hu (subset_biUnion_of_mem id h)
        have : u=∅ := disjoint_self.mp hh
        simp [this] at huc
        omega
      refine ⟨insert u A, by simp [hnew,hc],?_,?_⟩
      · simp only [coe_insert,Set.pairwise_insert_of_symm,mem_coe,ne_eq]
        exact ⟨hd,fun t ht _ => sdiff_disjoint.mono hu (subset_biUnion_of_mem id ht)⟩
      · simp only [mem_insert,forall_eq_or_imp]
        exact ⟨⟨hu.trans sdiff_subset,huc,huz⟩,hA⟩

end Kemnitz

theorem problem8 (n : ℕ) (hn : 1 ≤ n)
    (f : Fin (4 * n - 3) → ZMod n × ZMod n) :
    ∃ s : Finset (Fin (4 * n - 3)),
      s.card = n ∧ ∑ i ∈ s, f i = 0 := by
  classical
  haveI : NeZero n := ⟨by omega⟩
  let a (i : Fin (4*n-3)) : Fin 2 → ℤ := ![(f i).1.val,(f i).2.val]
  obtain ⟨s,_,hc,hz⟩ := Kemnitz.integerCase (s := Finset.univ) n a (by simp)
  refine ⟨s,hc,Prod.ext ?_ ?_⟩
  · have H := (ZMod.intCast_zmod_eq_zero_iff_dvd _ n).mpr (hz 0)
    simpa [a,Prod.fst_sum] using H
  · have H := (ZMod.intCast_zmod_eq_zero_iff_dvd _ n).mpr (hz 1)
    simpa [a,Prod.snd_sum] using H

#print axioms problem8