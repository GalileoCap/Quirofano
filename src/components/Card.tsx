export default function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card card-border bg-base-100">
      <div className="card-body gap-3 p-3 sm:p-4">
        <div>
          <h2 className="card-title text-base">{title}</h2>
          {hint && <p className="text-sm text-base-content/60">{hint}</p>}
        </div>
        {children}
      </div>
    </section>
  )
}
