import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node'
import { json, redirect } from '@remix-run/node'
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react'
import { useEffect, useState } from 'react'
import { NavBar } from '~/components/NavBar'
import { requireAuth } from '~/services/auth.server'
import { getUserAccess } from '~/utils/authAccess'
import { handleCleaningDashboardMutation, loadCleaningDashboard } from '~/services/cleaningDashboard.server'
import type { Assignment, Cleaner, Job } from '~/types/cleaning'

type MutationResult = Awaited<ReturnType<typeof handleCleaningDashboardMutation>>

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await requireAuth(request)
  if (!user.email) {
    throw new Error('User email is missing')
  }

  const access = await getUserAccess(user.email)
  if (access !== 'admin') return redirect('/no-access')

  const dashboard = await loadCleaningDashboard()

  return json({
    user,
    access,
    ...dashboard
  })
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await requireAuth(request)
  if (!user.email) {
    throw new Error('User email is missing')
  }

  const access = await getUserAccess(user.email)
  if (access !== 'admin') return redirect('/no-access')

  const formData = await request.formData()
  const result = await handleCleaningDashboardMutation(formData)

  return json(result, { status: result.ok ? 200 : 400 })
}

export default function DashboardPage() {
  const { user, access, cleaners, jobs, assignments, meta } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>() as MutationResult | undefined
  const navigation = useNavigation()

  const isSubmitting = navigation.state === 'submitting'

  const cleanerMessage = actionData?.area === 'cleaners' ? actionData : null
  const jobMessage = actionData?.area === 'jobs' ? actionData : null
  const assignmentMessage = actionData?.area === 'assignments' ? actionData : null

  const [editingCleanerId, setEditingCleanerId] = useState<number | null>(null)
  const [editingJobId, setEditingJobId] = useState<number | null>(null)
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null)

  useEffect(() => {
    if (actionData?.ok) {
      setEditingCleanerId(null)
      setEditingJobId(null)
      setEditingAssignmentId(null)
    }
  }, [actionData])

  return (
    <div className="min-h-screen bg-slate-100">
      <NavBar user={user} title="Cleaning Schedule" access={access as 'admin'} />

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        <Overview cleaners={cleaners} jobs={jobs} assignments={assignments} />

        <ManagementSection
          title="Cleaners"
          description="Manage your cleaning team. Track contact details and availability."
          data={cleaners}
          message={cleanerMessage}
          renderItem={(cleaner) => (
            <CleanerCard
              key={cleaner.id}
              cleaner={cleaner}
              statuses={meta.cleanerStatuses}
              editing={editingCleanerId === cleaner.id}
              onEdit={() => setEditingCleanerId(cleaner.id)}
              onCancel={() => setEditingCleanerId(null)}
              disableActions={isSubmitting}
            />
          )}
          createForm={(formId) => (
            <CleanerForm formId={formId} statuses={meta.cleanerStatuses} disabled={isSubmitting} />
          )}
        />

        <ManagementSection
          title="Jobs"
          description="Keep an eye on scheduled work and client details."
          data={jobs}
          message={jobMessage}
          renderItem={(job) => (
            <JobCard
              key={job.id}
              job={job}
              statuses={meta.jobStatuses}
              editing={editingJobId === job.id}
              onEdit={() => setEditingJobId(job.id)}
              onCancel={() => setEditingJobId(null)}
              disableActions={isSubmitting}
            />
          )}
          createForm={(formId) => <JobForm formId={formId} statuses={meta.jobStatuses} disabled={isSubmitting} />}
        />

        <ManagementSection
          title="Assignments"
          description="Assign cleaners to jobs on specific dates to build the schedule."
          data={assignments}
          message={assignmentMessage}
          renderItem={(assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              cleaners={cleaners}
              jobs={jobs}
              statuses={meta.assignmentStatuses}
              editing={editingAssignmentId === assignment.id}
              onEdit={() => setEditingAssignmentId(assignment.id)}
              onCancel={() => setEditingAssignmentId(null)}
              disableActions={isSubmitting}
            />
          )}
          createForm={(formId) => (
            <AssignmentForm
              formId={formId}
              cleaners={cleaners}
              jobs={jobs}
              statuses={meta.assignmentStatuses}
              disabled={isSubmitting}
            />
          )}
        />
      </main>
    </div>
  )
}

type ManagementSectionProps<T> = {
  title: string
  description: string
  data: T[]
  message: MutationResult | null
  renderItem: (item: T) => JSX.Element
  createForm: (formId: string) => JSX.Element
}

function ManagementSection<T>({
  title,
  description,
  data,
  message,
  renderItem,
  createForm
}: ManagementSectionProps<T>) {
  return (
    <section className="bg-white rounded-xl shadow-lg p-6 space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </header>

      {message && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${message.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-rose-300 bg-rose-50 text-rose-700'}`}
        >
          {message.message}
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">Add New</h3>
        {createForm(`${title.toLowerCase()}-create-form`)}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Current</h3>
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">No records yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">{data.map((item) => renderItem(item))}</div>
        )}
      </div>
    </section>
  )
}

type OverviewProps = {
  cleaners: Cleaner[]
  jobs: Job[]
  assignments: Assignment[]
}

function Overview({ cleaners, jobs, assignments }: OverviewProps) {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <SummaryCard
        title="Cleaners"
        value={cleaners.length}
        accent="bg-indigo-500"
        description="Active team members you can schedule."
      />
      <SummaryCard
        title="Jobs"
        value={jobs.length}
        accent="bg-sky-500"
        description="Tracked cleaning jobs and clients."
      />
      <SummaryCard
        title="Assignments"
        value={assignments.length}
        accent="bg-emerald-500"
        description="Scheduled visits on the calendar."
      />
    </section>
  )
}

type SummaryCardProps = {
  title: string
  value: number
  description: string
  accent: string
}

function SummaryCard({ title, value, description, accent }: SummaryCardProps) {
  return (
    <div className="bg-white rounded-xl shadow p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-semibold ${accent}`}>
        {value}
      </div>
      <div>
        <p className="text-sm uppercase tracking-wide text-slate-500">{title}</p>
        <p className="text-base text-slate-900 font-semibold">{description}</p>
      </div>
    </div>
  )
}

type CleanerFormProps = {
  formId: string
  statuses: string[]
  disabled?: boolean
}

function CleanerForm({ formId, statuses, disabled }: CleanerFormProps) {
  return (
    <Form method="post" id={formId} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="intent" value="create-cleaner" />
      <FormField label="Name" required>
        <input
          name="name"
          type="text"
          className="form-input"
          placeholder="Full name"
          required
          disabled={disabled}
        />
      </FormField>
      <FormField label="Email">
        <input name="email" type="email" className="form-input" placeholder="name@example.com" disabled={disabled} />
      </FormField>
      <FormField label="Phone">
        <input name="phone" type="text" className="form-input" placeholder="555-0100" disabled={disabled} />
      </FormField>
      <FormField label="Status">
        <select name="status" className="form-input" defaultValue={statuses[0]} disabled={disabled}>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Notes" fullWidth>
        <textarea name="notes" className="form-input" rows={3} placeholder="Optional notes" disabled={disabled} />
      </FormField>
      <div>
        <button type="submit" className="btn-primary" disabled={disabled}>
          Add Cleaner
        </button>
      </div>
    </Form>
  )
}

type CleanerCardProps = {
  cleaner: Cleaner
  statuses: string[]
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  disableActions?: boolean
}

function CleanerCard({ cleaner, statuses, editing, onEdit, onCancel, disableActions }: CleanerCardProps) {
  if (editing) {
    return (
      <div className="card space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-lg font-semibold text-slate-900">Edit {cleaner.name}</h4>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={disableActions}>
            Cancel
          </button>
        </div>
        <Form method="post" className="grid gap-3">
          <input type="hidden" name="intent" value="update-cleaner" />
          <input type="hidden" name="id" value={cleaner.id} />
          <input name="name" className="form-input" defaultValue={cleaner.name} required disabled={disableActions} />
          <input name="email" className="form-input" defaultValue={cleaner.email ?? ''} disabled={disableActions} />
          <input name="phone" className="form-input" defaultValue={cleaner.phone ?? ''} disabled={disableActions} />
          <select name="status" className="form-input" defaultValue={cleaner.status} disabled={disableActions}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <textarea
            name="notes"
            className="form-input"
            rows={3}
            defaultValue={cleaner.notes ?? ''}
            disabled={disableActions}
          />
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={disableActions}>
              Save Changes
            </button>
          </div>
        </Form>
        <Form method="post" className="flex justify-end">
          <input type="hidden" name="intent" value="delete-cleaner" />
          <input type="hidden" name="id" value={cleaner.id} />
          <button
            type="submit"
            className="btn-danger"
            disabled={disableActions}
            onClick={(event) => {
              if (!confirm('Remove this cleaner? This also removes related assignments.')) {
                event.preventDefault()
              }
            }}
          >
            Delete
          </button>
        </Form>
      </div>
    )
  }

  return (
    <div className="card space-y-3">
      <div className="flex justify-between items-start gap-2">
        <div>
          <h4 className="text-lg font-semibold text-slate-900">{cleaner.name}</h4>
          <p className="text-sm text-slate-500 capitalize">{cleaner.status}</p>
        </div>
        <button className="btn-secondary" type="button" onClick={onEdit} disabled={disableActions}>
          Edit
        </button>
      </div>
      <div className="space-y-1 text-sm text-slate-600">
        {cleaner.email && <p>Email: {cleaner.email}</p>}
        {cleaner.phone && <p>Phone: {cleaner.phone}</p>}
        {cleaner.notes && <p className="text-slate-500">{cleaner.notes}</p>}
      </div>
    </div>
  )
}

type JobFormProps = {
  formId: string
  statuses: string[]
  disabled?: boolean
}

function JobForm({ formId, statuses, disabled }: JobFormProps) {
  return (
    <Form method="post" id={formId} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="intent" value="create-job" />
      <FormField label="Title" required>
        <input name="title" type="text" className="form-input" placeholder="Job title" required disabled={disabled} />
      </FormField>
      <FormField label="Client">
        <input name="clientName" type="text" className="form-input" placeholder="Client name" disabled={disabled} />
      </FormField>
      <FormField label="Location">
        <input name="location" type="text" className="form-input" placeholder="Address" disabled={disabled} />
      </FormField>
      <FormField label="Rate">
        <input name="rate" type="number" step="0.01" className="form-input" placeholder="150" disabled={disabled} />
      </FormField>
      <FormField label="Status">
        <select name="status" className="form-input" defaultValue={statuses[0]} disabled={disabled}>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Description" fullWidth>
        <textarea name="description" className="form-input" rows={3} placeholder="Optional description" disabled={disabled} />
      </FormField>
      <div>
        <button type="submit" className="btn-primary" disabled={disabled}>
          Add Job
        </button>
      </div>
    </Form>
  )
}

type JobCardProps = {
  job: Job
  statuses: string[]
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  disableActions?: boolean
}

function JobCard({ job, statuses, editing, onEdit, onCancel, disableActions }: JobCardProps) {
  if (editing) {
    return (
      <div className="card space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-lg font-semibold text-slate-900">Edit {job.title}</h4>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={disableActions}>
            Cancel
          </button>
        </div>
        <Form method="post" className="grid gap-3">
          <input type="hidden" name="intent" value="update-job" />
          <input type="hidden" name="id" value={job.id} />
          <input name="title" className="form-input" defaultValue={job.title} required disabled={disableActions} />
          <input name="clientName" className="form-input" defaultValue={job.clientName ?? ''} disabled={disableActions} />
          <input name="location" className="form-input" defaultValue={job.location ?? ''} disabled={disableActions} />
          <input name="rate" className="form-input" type="number" step="0.01" defaultValue={job.rate ?? ''} disabled={disableActions} />
          <select name="status" className="form-input" defaultValue={job.status} disabled={disableActions}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <textarea
            name="description"
            className="form-input"
            rows={3}
            defaultValue={job.description ?? ''}
            disabled={disableActions}
          />
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={disableActions}>
              Save Changes
            </button>
          </div>
        </Form>
        <Form method="post" className="flex justify-end">
          <input type="hidden" name="intent" value="delete-job" />
          <input type="hidden" name="id" value={job.id} />
          <button
            type="submit"
            className="btn-danger"
            disabled={disableActions}
            onClick={(event) => {
              if (!confirm('Remove this job? Assignments linked to it will be removed.')) {
                event.preventDefault()
              }
            }}
          >
            Delete
          </button>
        </Form>
      </div>
    )
  }

  return (
    <div className="card space-y-3">
      <div className="flex justify-between items-start gap-2">
        <div>
          <h4 className="text-lg font-semibold text-slate-900">{job.title}</h4>
          <p className="text-sm text-slate-500 capitalize">{job.status}</p>
        </div>
        <button className="btn-secondary" type="button" onClick={onEdit} disabled={disableActions}>
          Edit
        </button>
      </div>
      <div className="space-y-1 text-sm text-slate-600">
        {job.clientName && <p>Client: {job.clientName}</p>}
        {job.location && <p>Location: {job.location}</p>}
        {job.rate !== null && <p>Rate: ${job.rate.toFixed(2)}</p>}
        {job.description && <p className="text-slate-500">{job.description}</p>}
      </div>
    </div>
  )
}

type AssignmentFormProps = {
  formId: string
  cleaners: Cleaner[]
  jobs: Job[]
  statuses: string[]
  disabled?: boolean
}

function AssignmentForm({ formId, cleaners, jobs, statuses, disabled }: AssignmentFormProps) {
  return (
    <Form method="post" id={formId} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="intent" value="create-assignment" />
      <FormField label="Job" required>
        <select name="jobId" className="form-input" required disabled={disabled}>
          <option value="">Select a job</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Cleaner" required>
        <select name="cleanerId" className="form-input" required disabled={disabled}>
          <option value="">Select a cleaner</option>
          {cleaners.map((cleaner) => (
            <option key={cleaner.id} value={cleaner.id}>
              {cleaner.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Service Date" required>
        <input name="serviceDate" type="date" className="form-input" required disabled={disabled} />
      </FormField>
      <FormField label="Status">
        <select name="status" className="form-input" defaultValue={statuses[0]} disabled={disabled}>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Notes" fullWidth>
        <textarea name="notes" className="form-input" rows={3} placeholder="Optional notes" disabled={disabled} />
      </FormField>
      <div>
        <button type="submit" className="btn-primary" disabled={disabled}>
          Add Assignment
        </button>
      </div>
    </Form>
  )
}

type AssignmentCardProps = {
  assignment: Assignment
  cleaners: Cleaner[]
  jobs: Job[]
  statuses: string[]
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  disableActions?: boolean
}

function AssignmentCard({
  assignment,
  cleaners,
  jobs,
  statuses,
  editing,
  onEdit,
  onCancel,
  disableActions
}: AssignmentCardProps) {
  if (editing) {
    return (
      <div className="card space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-lg font-semibold text-slate-900">Edit Assignment</h4>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={disableActions}>
            Cancel
          </button>
        </div>
        <Form method="post" className="grid gap-3">
          <input type="hidden" name="intent" value="update-assignment" />
          <input type="hidden" name="id" value={assignment.id} />
          <select name="jobId" className="form-input" defaultValue={assignment.jobId} disabled={disableActions}>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
          <select name="cleanerId" className="form-input" defaultValue={assignment.cleanerId} disabled={disableActions}>
            {cleaners.map((cleaner) => (
              <option key={cleaner.id} value={cleaner.id}>
                {cleaner.name}
              </option>
            ))}
          </select>
          <input name="serviceDate" type="date" className="form-input" defaultValue={assignment.serviceDate} disabled={disableActions} />
          <select name="status" className="form-input" defaultValue={assignment.status} disabled={disableActions}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <textarea
            name="notes"
            className="form-input"
            rows={3}
            defaultValue={assignment.notes ?? ''}
            disabled={disableActions}
          />
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={disableActions}>
              Save Changes
            </button>
          </div>
        </Form>
        <Form method="post" className="flex justify-end">
          <input type="hidden" name="intent" value="delete-assignment" />
          <input type="hidden" name="id" value={assignment.id} />
          <button
            type="submit"
            className="btn-danger"
            disabled={disableActions}
            onClick={(event) => {
              if (!confirm('Remove this assignment?')) {
                event.preventDefault()
              }
            }}
          >
            Delete
          </button>
        </Form>
      </div>
    )
  }

  return (
    <div className="card space-y-3">
      <div className="flex justify-between items-start gap-2">
        <div>
          <h4 className="text-lg font-semibold text-slate-900">{assignment.jobTitle}</h4>
          <p className="text-sm text-slate-500">{assignment.cleanerName}</p>
        </div>
        <button className="btn-secondary" type="button" onClick={onEdit} disabled={disableActions}>
          Edit
        </button>
      </div>
      <div className="space-y-1 text-sm text-slate-600">
        <p>Date: {assignment.serviceDate}</p>
        <p className="capitalize">Status: {assignment.status}</p>
        {assignment.notes && <p className="text-slate-500">{assignment.notes}</p>}
      </div>
    </div>
  )
}

type FormFieldProps = {
  label: string
  required?: boolean
  fullWidth?: boolean
  children: React.ReactNode
}

function FormField({ label, required, fullWidth, children }: FormFieldProps) {
  return (
    <div className={`flex flex-col gap-1 text-sm text-slate-600 ${fullWidth ? 'md:col-span-2' : ''}`}>
      <span className="font-medium text-slate-700">
        {label}
        {required ? <span className="text-rose-500 ml-1">*</span> : null}
      </span>
      {children}
    </div>
  )
}
