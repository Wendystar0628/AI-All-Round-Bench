import Mathlib.Analysis.MeanInequalities
import Mathlib.Data.Finset.Interval
import Mathlib.Combinatorics.SetFamily.Compression.Down
import Mathlib.Tactic

open Finset
namespace UnionFamily
variable {α : Type*} [DecidableEq α]

private def rise (B : Finset (Finset α)) (x : α) (s : Finset α) :=
  if insert x s ∈ B then s else insert x s

private lemma rise_inj (B : Finset (Finset α)) (x : α) : Set.InjOn (rise B x) B := by
  intro s hs t ht he
  change s ∈ B at hs
  change t ∈ B at ht
  unfold rise at he
  split_ifs at he with h1 h2 h2
  · exact he
  · exact False.elim (h2 (he ▸ hs))
  · exact False.elim (h1 (he.symm ▸ ht))
  · have hs' : x ∉ s := fun h => h1 (by simpa [insert_eq_of_mem h] using hs)
    have ht' : x ∉ t := fun h => h2 (by simpa [insert_eq_of_mem h] using ht)
    simpa [erase_insert hs', erase_insert ht'] using congrArg (fun a : Finset α => a.erase x) he

private lemma rise_mem {B : Finset (Finset α)} {x : α} {s : Finset α} (hs : s ∈ B) :
    insert x s ∈ B.image (rise B x) := by
  by_cases h : insert x s ∈ B
  · exact mem_image.mpr ⟨_, h, by simp [rise, h]⟩
  · exact mem_image.mpr ⟨_, hs, by simp [rise, h]⟩

private lemma stable {B : Finset (Finset α)} {x : α} {g : Finset α}
    (hg : ∀ s ∈ B, s ∪ g ∈ B) :
    ∀ t ∈ B.image (rise B x), t ∪ g ∈ B.image (rise B x) := by
  intro t ht
  obtain ⟨s,hs,rfl⟩ := mem_image.mp ht
  by_cases h : insert x s ∈ B
  · have hi := hg _ h
    rw [insert_union] at hi
    exact mem_image.mpr ⟨s ∪ g, hg _ hs, by simp [rise,h,hi]⟩
  · simpa [rise,h,insert_union] using rise_mem (x := x) (hg _ hs)

private lemma lifting (A : Finset (Finset α))
    (hA : ∀ a ∈ A, ∀ b ∈ A, a ∪ b ∈ A) (T : Finset α) :
    ∃ v : Finset α → Finset α, Set.InjOn v A ∧
      (∀ a ∈ A, a ⊆ v a ∧ v a ⊆ a ∪ T ∧ ∀ b ∈ A, b ⊆ v a → b ⊆ a) ∧
      (∀ b ∈ A, ∀ s ∈ A.image v, s ∪ b ∈ A.image v) ∧
      (∀ x ∈ T, ∀ s ∈ A.image v, insert x s ∈ A.image v) := by
  induction T using Finset.induction_on with
  | empty => exact ⟨id, Function.injective_id.injOn, by simp, by simpa using fun b hb s hs => hA s hs b hb, by simp⟩
  | @insert x T hx ih =>
    obtain ⟨v,hv,hprop,hold,hins⟩ := ih
    let B := A.image v
    let w := rise B x
    refine ⟨w ∘ v, (rise_inj B x).comp hv (fun a ha => mem_image_of_mem _ ha), ?_, ?_, ?_⟩
    · intro a ha
      obtain ⟨ha₀,ha₁,ha₂⟩ := hprop a ha
      change a ⊆ w (v a) ∧ w (v a) ⊆ a ∪ insert x T ∧ _
      by_cases h : insert x (v a) ∈ B
      · simpa [w,rise,h] using And.intro ha₀ (And.intro (ha₁.trans (subset_insert x (a ∪ T))) ha₂)
      · simp only [Function.comp_apply,w,rise,if_neg h]
        refine ⟨ha₀.trans (subset_insert _ _), ?_, ?_⟩
        · rw [union_insert]; exact insert_subset_insert _ ha₁
        · intro b hb hb'
          apply ha₂ b hb
          by_contra hn
          have he : v a ∪ b = insert x (v a) := by
            ext y; simp only [mem_union,mem_insert]
            have hx' : x ∈ b := by
              by_contra hx'
              apply hn
              intro i hi
              exact (mem_insert.mp (hb' hi)).resolve_left (fun eq => hx' (eq ▸ hi))
            constructor
            · rintro (hy | hy)
              · exact Or.inr hy
              · exact mem_insert.mp (hb' hy)
            · rintro (rfl | hy)
              · exact Or.inr hx'
              · exact Or.inl hy
          exact h (he ▸ hold b hb (v a) (mem_image_of_mem _ ha))
    · rw [← image_image]
      exact fun b hb => stable (hold b hb)
    · rw [← image_image]
      intro y hy
      rcases mem_insert.mp hy with rfl | hy
      · intro s hs
        obtain ⟨t,ht,rfl⟩ := mem_image.mp hs
        change insert y (rise B y t) ∈ B.image (rise B y)
        have he : insert y (rise B y t) = insert y t := by unfold rise; split <;> simp
        rw [he]; exact rise_mem ht
      · have H := stable (x := x) (g := {y}) (B := B) (by simpa only [union_singleton] using hins y hy)
        simpa only [union_singleton] using H

private lemma mergeBound (a b : ℕ) (h : a ≤ b) :
    a^a * b^b * 2^(2*a) ≤ (a+b)^(a+b) := by
  obtain ⟨c,rfl⟩ := Nat.exists_eq_add_of_le h
  have H : 4 * a*(a+c) ≤ (a+(a+c))^2 := by nlinarith [sq_nonneg (c:ℤ)]
  calc
    _ = (4*a*(a+c))^a * (a+c)^c := by rw [pow_add, pow_mul]; simp only [mul_pow]; ring
    _ ≤ ((a+(a+c))^2)^a * (a+(a+c))^c := Nat.mul_le_mul (Nat.pow_le_pow_left H _) (Nat.pow_le_pow_left (by omega) _)
    _ = _ := by rw [← pow_mul, ← pow_add]; congr 1; omega

private def missing (U : Finset α) (B : Finset (Finset α)) := ∑ s ∈ B, (U.card-s.card)

private lemma edgeBound (U : Finset α) (B : Finset (Finset α))
    (hsub : ∀ s ∈ B, s ⊆ U) (hup : ∀ x ∈ U, ∀ s ∈ B, insert x s ∈ B) :
    2^(2*missing U B) ≤ B.card^B.card := by
  induction U using Finset.induction_on generalizing B with
  | empty =>
    simp only [missing,card_empty,Nat.zero_sub,sum_const_zero,mul_zero,pow_zero]
    by_cases h : B.card = 0
    · simp [h]
    · exact Nat.one_le_iff_ne_zero.mpr (pow_ne_zero _ h)
  | @insert x U hx ih =>
    let L := B.nonMemberSubfamily x
    let R := B.memberSubfamily x
    have hsL (s) (hs : s ∈ L) : s ⊆ U := by
      obtain ⟨h,hx'⟩ := mem_nonMemberSubfamily.mp hs
      intro i hi
      exact (mem_insert.mp (hsub s h hi)).resolve_left (fun eq => hx' (eq ▸ hi))
    have hsR (s) (hs : s ∈ R) : s ⊆ U := by
      obtain ⟨h,hx'⟩ := mem_memberSubfamily.mp hs
      intro i hi
      exact (mem_insert.mp (hsub _ h (mem_insert_of_mem hi))).resolve_left (fun eq => hx' (eq ▸ hi))
    have hL := ih L hsL (by
      intro i hi s hs
      obtain ⟨h,hn⟩ := mem_nonMemberSubfamily.mp hs
      exact mem_nonMemberSubfamily.mpr ⟨hup i (mem_insert_of_mem hi) s h, by simp [ne_of_mem_of_not_mem hi hx,hn, Ne.symm (ne_of_mem_of_not_mem hi hx)]⟩)
    have hR := ih R hsR (by
      intro i hi s hs
      obtain ⟨h,hn⟩ := mem_memberSubfamily.mp hs
      apply mem_memberSubfamily.mpr
      exact ⟨by rw [insert_comm]; exact hup i (mem_insert_of_mem hi) _ h, by simp [hn,Ne.symm (ne_of_mem_of_not_mem hi hx)]⟩)
    have hlr : L ⊆ R := fun s hs => mem_memberSubfamily.mpr
      ⟨hup x (mem_insert_self ..) _ (mem_nonMemberSubfamily.mp hs).1, (mem_nonMemberSubfamily.mp hs).2⟩
    have hc : B.card = L.card + R.card := by simpa [L,R,add_comm] using (card_memberSubfamily_add_card_nonMemberSubfamily x B).symm
    have dec : B = L ∪ R.image (insert x) := by
      ext s
      simp only [mem_union,mem_image,L,R,mem_nonMemberSubfamily,mem_memberSubfamily]
      constructor
      · intro hs
        by_cases h : x ∈ s
        · exact Or.inr ⟨s.erase x,⟨by rwa [insert_erase h],by simp⟩,insert_erase h⟩
        · exact Or.inl ⟨hs,h⟩
      · rintro (h | ⟨t,h,rfl⟩)
        · exact h.1
        · exact h.1
    have dis : Disjoint L (R.image (insert x)) := by
      apply disjoint_left.mpr
      rintro s hs ht
      obtain ⟨t,_,rfl⟩ := mem_image.mp ht
      exact (mem_nonMemberSubfamily.mp hs).2 (mem_insert_self ..)
    have hinj : Set.InjOn (fun s : Finset α => insert x s) (R : Set (Finset α)) := by
      intro s hs t ht he
      simpa [erase_insert (mem_memberSubfamily.mp hs).2,erase_insert (mem_memberSubfamily.mp ht).2] using congrArg (fun z : Finset α => z.erase x) he
    have hm : missing (insert x U) B = missing U L + missing U R + L.card := by
      unfold missing
      conv_lhs => rw [dec,sum_union dis,sum_image hinj]
      rw [card_insert_of_notMem hx]
      have h1 (s) (hs : s ∈ L) : U.card+1-s.card = (U.card-s.card)+1 := by have := card_le_card (hsL _ hs); omega
      have h2 (s) (hs : s ∈ R) : U.card+1-(insert x s).card = U.card-s.card := by rw [card_insert_of_notMem (mem_memberSubfamily.mp hs).2]; omega
      rw [Finset.sum_congr rfl h1,Finset.sum_congr rfl h2, sum_add_distrib]
      simp; omega
    rw [hm,hc, Nat.mul_add,Nat.mul_add,pow_add,pow_add]
    exact (Nat.mul_le_mul_right _ (Nat.mul_le_mul hL hR)).trans (mergeBound _ _ (card_le_card hlr))

private lemma amgm {β : Type*} (A : Finset β) (hA : A.Nonempty) (d : β → ℕ) :
    A.card ^ A.card * 2^(∑ a ∈ A,d a) ≤ (∑ a ∈ A,2^(d a))^A.card := by
  have hm : 0 < (A.card : ℝ) := by exact_mod_cast card_pos.mpr hA
  have H := Real.geom_mean_le_arith_mean A (fun _ => 1) (fun a => (2:ℝ)^(d a))
    (by simp) (by simpa using hm) (by intros; positivity)
  simp only [Real.rpow_one, sum_const, nsmul_eq_mul, Nat.cast_id, mul_one, one_mul,
    prod_pow_eq_pow_sum] at H
  have H' := pow_le_pow_left₀ (Real.rpow_nonneg (by positivity) _) H A.card
  rw [← Real.rpow_mul_natCast (by positivity), inv_mul_cancel₀ hm.ne',Real.rpow_one,div_pow] at H'
  have H'' := (le_div_iff₀ (pow_pos hm _)).mp H'
  rw [mul_comm] at H''
  exact_mod_cast H''

end UnionFamily
open UnionFamily

theorem problem4 {α : Type*} [DecidableEq α]
    (A : Finset (Finset α)) (hA : A.Nonempty)
    (hunion : ∀ a ∈ A, ∀ b ∈ A, a ∪ b ∈ A) :
    A.card ^ A.card ≤ 2 ^ (2 * ∑ a ∈ A, a.card) := by
  classical
  let U := A.biUnion id
  have hU (a) (ha : a ∈ A) : a ⊆ U := fun _ hx => mem_biUnion.mpr ⟨a,ha,hx⟩
  obtain ⟨v,hv,hprop,_,hup⟩ := lifting A hunion U
  let B := A.image v
  have hB (s) (hs : s ∈ B) : s ⊆ U := by
    obtain ⟨a,ha,rfl⟩ := mem_image.mp hs
    exact (hprop a ha).2.1.trans (union_subset (hU a ha) Subset.rfl)
  have hvU (a) (ha : a ∈ A) : v a ⊆ U := hB _ (mem_image_of_mem _ ha)
  let d (a : Finset α) := (v a).card - a.card
  have dis : (A : Set (Finset α)).PairwiseDisjoint (fun a => Icc a (v a)) := by
    intro a ha b hb hne
    apply disjoint_left.mpr
    intro s hs ht
    have H := (hprop a ha).2.2 b hb ((mem_Icc.mp ht).1.trans (mem_Icc.mp hs).2)
    have H' := (hprop b hb).2.2 a ha ((mem_Icc.mp hs).1.trans (mem_Icc.mp ht).2)
    exact hne (Subset.antisymm H' H)
  have hsub : (A.biUnion fun a => Icc a (v a)) ⊆ U.powerset := by
    intro s hs
    obtain ⟨a,ha,hs⟩ := mem_biUnion.mp hs
    exact mem_powerset.mpr ((mem_Icc.mp hs).2.trans (hvU a ha))
  have hcount := card_le_card hsub
  rw [card_biUnion dis, card_powerset] at hcount
  have hcount' : ∑ a ∈ A,2^(d a) ≤ 2^U.card := by
    convert hcount using 1
    exact sum_congr rfl fun a ha => (card_Icc_finset (hprop a ha).1).symm
  have H := (amgm A hA d).trans (Nat.pow_le_pow_left hcount' A.card)
  have hsum : U.card*A.card = (∑ a ∈ A, d a) + missing U B + ∑ a ∈ A,a.card := by
    simp only [B,missing,sum_image hv, ← sum_add_distrib]
    calc
      _ = ∑ _a ∈ A,U.card := by simp [Nat.mul_comm]
      _ = _ := sum_congr rfl fun a ha => by
        have := card_le_card (hvU a ha)
        have := card_le_card (hprop a ha).1
        dsimp [d]; omega
  rw [← pow_mul,hsum,add_assoc,pow_add] at H
  have H1 := Nat.le_of_mul_le_mul_left (by simpa only [mul_comm (A.card^A.card)] using H)
    (show 0 < 2^(∑ a ∈ A,d a) by positivity)
  rw [pow_add] at H1
  have H2 := edgeBound U B hB hup
  have hcard : B.card = A.card := card_image_of_injOn hv
  rw [hcard, mul_comm 2,pow_mul] at H2
  rw [mul_comm 2,pow_mul]
  let L := A.card^A.card
  let V := 2^(∑ a ∈ A,a.card)
  let C := 2^(missing U B)
  change L ≤ C*V at H1
  change C^2 ≤ L at H2
  change L ≤ V^2
  by_contra! hn
  have hc : V < C := by
    by_contra! h
    nlinarith [Nat.mul_le_mul_right V h]
  nlinarith [Nat.mul_lt_mul_of_pos_left hc (show 0 < C by dsimp [C]; positivity)]

#print axioms problem4